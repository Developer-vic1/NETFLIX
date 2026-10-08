import test from "node:test";
import assert from "node:assert/strict";
import { uploadVideo } from "../js/services/media-upload.service.js";

class FakeRequest extends EventTarget {
  static requests = [];
  constructor() { super(); this.upload = new EventTarget(); this.headers = {}; FakeRequest.requests.push(this); }
  open() {}
  setRequestHeader(name, value) { this.headers[name] = value; }
  send(file) { this.file = file; }
  abort() { this.dispatchEvent(new Event("abort")); }
  progress(loaded) { const event = new Event("progress"); Object.assign(event, { loaded }); this.upload.dispatchEvent(event); }
  finish() {
    this.status = 201;
    this.responseText = JSON.stringify({ url: `assets/videos/library/${this.headers["X-Upload-Id"]}.${this.file.name.endsWith('.mkv') ? 'mkv' : 'mp4'}`, size: this.file.size });
    this.dispatchEvent(new Event("load"));
  }
}
globalThis.XMLHttpRequest = FakeRequest;

test("MKV upload uses the Matroska MIME type and keeps its extension", async () => {
  const pending = uploadVideo(new File(["packets"], "original.mkv", { type: "video/x-matroska" }));
  const request = FakeRequest.requests.at(-1);
  assert.equal(request.headers["Content-Type"], "video/x-matroska");
  request.finish();
  assert.match((await pending).url, /\.mkv$/);
});

test("transport waits for server confirmation and reuses a completed file on retry", async () => {
  const file = new File(["content"], "original.mp4", { type: "video/mp4" });
  const updates = [];
  let completed = false;
  const pending = uploadVideo(file, { onProgress: (value) => updates.push(value) }).then((value) => { completed = true; return value; });
  const request = FakeRequest.requests.at(-1);
  request.progress(file.size); request.upload.dispatchEvent(new Event("load"));
  await Promise.resolve(); assert.equal(completed, false);
  assert.equal(updates.at(-1).phase, "confirming");
  request.finish(); const saved = await pending;
  const before = FakeRequest.requests.length;
  assert.deepEqual(await uploadVideo(file), saved);
  assert.equal(FakeRequest.requests.length, before);
});

test("an aborted transfer rejects as cancellation rather than an upload error", async () => {
  const controller = new AbortController();
  const pending = uploadVideo(new File(["x"], "cancel.mp4", { type: "video/mp4" }), { signal: controller.signal });
  controller.abort(); await assert.rejects(pending, { name: "AbortError" });
});

test("retry after a stored video was renamed does not require the old source again", async () => {
  const originalFetch = globalThis.fetch;
  let registrations = 0, starts = 0;
  const sourceToken = "c".repeat(32);
  const original = { url: "videos/old-title.mp4", size: 20, name: "old-title.mp4" };
  const result = { url: "videos/new-title.mp4", size: 20, name: "new-title.mp4" };
  globalThis.fetch = async (url) => {
    if (url === "/api/media/source") {
      registrations++; assert.equal(registrations, 1);
      return new Response(JSON.stringify({ sourceToken, url: `/api/media/source/${sourceToken}`, size: 20 }));
    }
    if (url === "/api/imports") { starts++; return new Response(JSON.stringify({ id: "d".repeat(32) })); }
    return new Response(JSON.stringify({ status: "ready", loaded: 20, result }));
  };
  try {
    assert.deepEqual(await uploadVideo(original, { title: "New Title", kind: "movie" }), result);
    assert.deepEqual(await uploadVideo(original, { title: "New Title", kind: "movie" }), result);
    assert.equal(starts, 1);
  } finally { globalThis.fetch = originalFetch; }
});
