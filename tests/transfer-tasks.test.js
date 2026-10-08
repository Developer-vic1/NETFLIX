import test from "node:test";
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { createTransferManager } = await import("../js/services/transfer-tasks.service.js");
const tick = () => new Promise((resolve) => setImmediate(resolve));
const descriptor = { name: "Película", profileId: "admin", total: 100, fileCount: 1 };

test("large transfers are queued, progress is monotonic, and 100 bytes do not finish catalog saving", async () => {
  const manager = createTransferManager({ owner: () => ({ id: "admin", role: "admin" }) });
  let finish, secondStarted = false;
  const first = manager.enqueue(descriptor, async (context) => {
    context.update({ loaded: 75, phase: "uploading" });
    context.update({ loaded: 20 });
    context.update({ loaded: 100, phase: "confirming" });
    await new Promise((resolve) => { finish = resolve; });
    context.commit(); return { id: "film-1" };
  });
  const second = manager.enqueue(descriptor, async (context) => { secondStarted = true; context.commit(); return { id: "film-2" }; });
  await tick();
  assert.equal(manager.get(first.id).loaded, 100);
  assert.equal(manager.get(first.id).status, "active");
  assert.equal(manager.cancel(first.id), false);
  assert.equal(manager.get(second.id).status, "queued");
  assert.equal(secondStarted, false);
  finish(); await first.promise; await second.promise;
  assert.equal(manager.get(first.id).status, "ready");
  assert.equal(manager.get(second.id).titleId, "film-2");
});

test("cancellation and retries preserve ownership and never cancel a catalog commit", async () => {
  let owner = { id: "admin", role: "admin" }, attempts = 0;
  const manager = createTransferManager({ owner: () => owner });
  const failed = manager.enqueue(descriptor, async (context) => {
    attempts++; context.update({ loaded: 40 });
    if (attempts === 1) throw new Error("library.serverUnavailable");
    context.commit(); return { id: "recovered" };
  });
  await assert.rejects(failed.promise, /serverUnavailable/);
  owner = { id: "viewer", role: "viewer" };
  assert.equal(manager.retry(failed.id), false);
  owner = { id: "admin", role: "admin" };
  assert.equal(manager.retry(failed.id), true);
  await tick(); assert.equal(manager.get(failed.id).status, "ready");
  let release;
  const committing = manager.enqueue(descriptor, async (context) => {
    context.commit(); await new Promise((resolve) => { release = resolve; }); return { id: "saved" };
  });
  await tick(); assert.equal(manager.cancel(committing.id), false);
  release(); await committing.promise;
  const cancelled = manager.enqueue(descriptor, async (context) => {
    await new Promise((resolve) => context.signal.addEventListener("abort", resolve, { once: true }));
    context.checkpoint();
  });
  await tick(); assert.equal(manager.cancel(cancelled.id), true);
  await assert.rejects(cancelled.promise, { name: "AbortError" });
  assert.equal(manager.get(cancelled.id).status, "cancelled");
});
