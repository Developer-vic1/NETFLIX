import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const source = await readFile(new URL("../sw.js", import.meta.url), "utf8");
function worker(fetch = async () => { throw new Error("offline"); }, cacheMatch = async () => null, cacheLifecycle = {}, online = false) {
  const handlers = {};
  const context = vm.createContext({ Response, ReadableStream, DOMException,
    URL, fetch, caches: { open: async () => ({ match: cacheMatch }), ...cacheLifecycle },
    self: { navigator: { onLine: online }, clients: { claim: async () => {} }, location: { origin: "http://localhost" }, addEventListener: (name, callback) => { handlers[name] = callback; } },
  });
  vm.runInContext(source, context);
  return { range: context.cachedMediaRange, handlers };
}
function cached(size, chunkSize = 65536) {
  let read = 0, cancelled = false;
  const response = new Response(new ReadableStream({
    pull(controller) {
      const length = Math.min(chunkSize, size - read);
      if (!length) return controller.close();
      controller.enqueue(Uint8Array.from({ length }, (_, i) => (read + i) % 251));
      read += length;
    },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 }), { headers: { "Content-Length": String(size), "Content-Type": "video/mp4" } });
  response.blob = response.arrayBuffer = () => { throw new Error("Whole-file allocation forbidden"); };
  return { response, get read() { return read; }, get cancelled() { return cancelled; } };
}
test("tiny ranges of a 15GB video read one chunk and cancel the remaining body", async () => {
  const input = cached(15 * 1024 ** 3);
  const response = worker().range(input.response, "bytes=20-29");
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("content-range"), `bytes 20-29/${15 * 1024 ** 3}`);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], Array.from({ length: 10 }, (_, i) => i + 20));
  assert.equal(input.read, 65536);
  assert.equal(input.cancelled, true);
});
test("suffix and cross-chunk ranges return exact bytes", async () => {
  for (const [range, start, end] of [["bytes=-9", 991, 999], ["bytes=247-264", 247, 264], ["bytes=998-2000", 998, 999], ["bytes=990-", 990, 999]]) {
    const input = cached(1000, 128);
    const response = worker().range(input.response, range);
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], Array.from({ length: end - start + 1 }, (_, i) => (start + i) % 251));
  }
});
test("invalid ranges return 416 without reading media", async () => {
  for (const range of ["bytes=", "bytes=-0", "bytes=1000-", "bytes=12-3", "bytes=0-2,4-6", "bytes=999999999999999999-"]) {
    const input = cached(1000);
    assert.equal(worker().range(input.response, range).status, 416);
    assert.equal(input.read, 0);
    assert.equal(input.cancelled, true);
  }
});
test("consumer and request cancellation release the cached reader", async () => {
  const input = cached(1000000);
  const response = worker().range(input.response, "bytes=0-");
  const reader = response.body.getReader();
  await reader.read();
  await reader.cancel();
  assert.equal(input.cancelled, true);
  assert.equal(input.read, 65536);
  const other = cached(1000000), abort = new AbortController();
  const pending = worker().range(other.response, "bytes=0-", abort.signal);
  abort.abort();
  await assert.rejects(pending.arrayBuffer(), { name: "AbortError" });
  assert.equal(other.cancelled, true);
});
test("local playback goes directly to the native media loader without stream relays", async () => {
  let cacheCalls = 0, fetchCalls = 0;
  const { handlers } = worker(async () => { fetchCalls++; }, async () => { cacheCalls++; }, {}, true);
  const request = new Request("http://localhost/series/episode.mp4", { headers: { Range: "bytes=50-99" } });
  let result;
  handlers.fetch({ request, respondWith: (promise) => { result = promise; } });
  assert.equal(result, undefined);
  assert.equal(fetchCalls, 0);
  assert.equal(cacheCalls, 0);
});
test("offline playback retains the download and streams its requested range", async () => {
  const input = cached(1000);
  const { handlers } = worker(undefined, async () => input.response);
  let result;
  handlers.fetch({ request: new Request("http://localhost/series/episode.mp4", { headers: { Range: "bytes=100-109" } }), respondWith: (promise) => { result = promise; } });
  assert.equal((await result).status, 206);
  assert.equal((await (await result).arrayBuffer()).byteLength, 10);
});
test("worker update removes old app bundles and preserves downloaded media", async () => {
  const removed = [];
  const { handlers } = worker(undefined, undefined, {
    keys: async () => ["netflix-app-v1", "netflix-app-v2", "netflix-media-v1", "other-app"],
    delete: async key => removed.push(key),
  });
  let result;
  handlers.activate({ waitUntil: promise => { result = promise; } });
  await result;
  assert.deepEqual(removed, ["netflix-app-v1"]);
});
