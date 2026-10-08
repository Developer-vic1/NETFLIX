import test from "node:test";
import assert from "node:assert/strict";
import { encodeLibraryCover, libraryWireRecord, mergeLibraryRecords, readDiskLibrary, writeDiskLibrary, hydrateDiskCover } from "../js/services/library-disk.service.js";

const video = { url: "videos/mi-pelicula.mp4", name: "Mi película.mp4", size: 1024 };
const cover = new Blob(["bounded-image"], { type: "image/webp" });
const record = { id: "local-11111111-1111-4111-8111-111111111111", kind: "movie", metadata: { name: "Mi película", description: "Una descripción completa de la película.", creator: "Carla Encinas", genre: "Aventura", year: 2026, ageRating: "all", originalLanguage: "es" }, video, media: { duration: 100, width: 1920, height: 1080 }, cover, status: "published", updatedAt: "2026-10-08T00:00:00Z" };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

test("durable library transport serializes the bounded cover and descriptors without MP4 Blobs", async () => {
  let sent;
  const result = await writeDiskLibrary(record, { fetcher: async (url, options) => {
    assert.equal(url, "/api/library"); assert.equal(options.method, "POST");
    sent = JSON.parse(options.body);
    return json({ ...sent.record, coverUrl: "data/library/covers/cover.webp" });
  } });
  assert.equal(sent.cover.data, btoa("bounded-image"));
  assert.equal(sent.cover.type, "image/webp");
  assert.deepEqual(sent.record.video, video);
  assert.equal("cover" in sent.record, false);
  assert.equal(result.cover, cover);
  assert.throws(() => libraryWireRecord({ ...record, video: new Blob(["video"]) }), /library.invalid/);
  await assert.rejects(encodeLibraryCover(new Blob(["svg"], { type: "image/svg+xml" })), /library.invalid/);
});

test("older servers and unavailable durable storage reject instead of claiming success", async () => {
  for (const status of [404, 405, 501]) {
    await assert.rejects(writeDiskLibrary(record, { fetcher: async () => json({}, status) }), /library.serverOutdated/);
    await assert.rejects(readDiskLibrary({ fetcher: async () => json({}, status) }), /library.serverOutdated/);
  }
  await assert.rejects(writeDiskLibrary(record, { fetcher: async () => json({}, 507) }), /library.spaceError/);
  await assert.rejects(readDiskLibrary({ fetcher: async () => { throw new TypeError("offline"); } }), /library.serverUnavailable/);
});

test("merge preserves IDs and statuses, uses newest entry and favors durable storage on ties", () => {
  const draft = { ...record, status: "draft", updatedAt: "2026-10-09T00:00:00Z" };
  assert.deepEqual(mergeLibraryRecords([draft], [record]), [draft]);
  const durable = { ...record, coverUrl: "data/library/covers/cover.webp" };
  assert.equal(mergeLibraryRecords([record], [durable])[0], durable);
  assert.deepEqual(mergeLibraryRecords([record], []), [record]);
});

test("cover hydration loads disk images and retains cached image during an outage", async () => {
  const wire = { ...libraryWireRecord(record), coverUrl: "data/library/covers/cover.webp" };
  const disk = await hydrateDiskCover(wire, undefined, { fetcher: async () => new Response(cover) });
  assert.equal(await disk.cover.text(), "bounded-image");
  const cached = await hydrateDiskCover(wire, cover, { fetcher: async () => { throw new TypeError("offline"); } });
  assert.equal(cached.cover, cover);
  await assert.rejects(hydrateDiskCover({ ...wire, coverUrl: "https://other.test/cover.webp" }), /library.coverUnavailable/);
});

test("successful disk publication survives unavailable IndexedDB cache", async () => {
  const preferences = new Map([["nsip.preferences.v1", JSON.stringify({ selectedProfile: "administrator" })]]);
  globalThis.localStorage = { getItem: (key) => preferences.get(key) ?? null, setItem: (key, value) => preferences.set(key, value) };
  const { switchProfile } = await import("../js/services/profile.service.js");
  switchProfile("administrator");
  const { saveFilm, libraryRecords } = await import("../js/services/library.service.js");
  const { eventBus } = await import("../js/services/event-bus.service.js");
  const previousFetch = globalThis.fetch, previousDatabase = globalThis.indexedDB;
  globalThis.indexedDB = { open() { throw new Error("Cache unavailable"); } };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/library");
    const sent = JSON.parse(options.body);
    return json({ ...sent.record, coverUrl: "data/library/covers/cover.webp" });
  };
  try {
    const saved = await saveFilm({ ...record, id: undefined });
    assert.equal(saved.status, "published");
    assert.ok(libraryRecords().some((item) => item.id === saved.id));
    assert.ok(eventBus.history.some((event) => event.name === "LIBRARY_CACHE_WARNING"));
  } finally { globalThis.fetch = previousFetch; globalThis.indexedDB = previousDatabase; }
});

test("disk loading restores valid entries when browser cache fails and one entry is malformed", async () => {
  const { loadLibrary, libraryRecords } = await import("../js/services/library.service.js");
  const previousFetch = globalThis.fetch, previousDatabase = globalThis.indexedDB;
  const restored = { ...libraryWireRecord(record), id: "local-22222222-2222-4222-8222-222222222222", coverUrl: "data/library/covers/cover.webp" };
  globalThis.indexedDB = { open() { throw new Error("Cache unavailable"); } };
  globalThis.fetch = async (url, options) => {
    if (url === "/api/library") return json({ records: [{ ...restored, id: "local-broken", metadata: {} }, restored] });
    if (url === restored.coverUrl) return new Response(cover);
    assert.equal(options.method, "HEAD"); return new Response(null);
  };
  try {
    await loadLibrary();
    assert.ok(libraryRecords().some((item) => item.id === restored.id && !item.invalidVideo));
    assert.equal(libraryRecords().some((item) => item.id === "local-broken"), false);
  } finally { globalThis.fetch = previousFetch; globalThis.indexedDB = previousDatabase; }
});

test("cached entries missing on disk migrate metadata and existing MP4 paths without another upload", async () => {
  const { loadLibrary, libraryRecords } = await import("../js/services/library.service.js");
  const previousFetch = globalThis.fetch, previousDatabase = globalThis.indexedDB;
  const draft = { ...record, id: "local-33333333-3333-4333-8333-333333333333", status: "draft" };
  const cached = [];
  const db = { transaction() {
    const tx = { objectStore() { return {
      getAll() { const request = {}; queueMicrotask(() => { request.result = [draft]; request.onsuccess(); }); return request; },
      put(value) { cached.push(value); queueMicrotask(() => tx.oncomplete()); },
    }; } }; return tx;
  } };
  globalThis.indexedDB = { open() { const request = {}; queueMicrotask(() => { request.result = db; request.onsuccess(); }); return request; } };
  let migration;
  globalThis.fetch = async (url, options) => {
    if (url === "/api/library" && options.method === "POST") { migration = JSON.parse(options.body); return json({ ...migration.record, coverUrl: "data/library/covers/cover.webp" }); }
    if (url === "/api/library") return json({ records: [] });
    assert.equal(url, video.url); assert.equal(options.method, "HEAD"); return new Response(null);
  };
  try {
    await loadLibrary();
    assert.equal(migration.record.id, draft.id);
    assert.equal(migration.record.status, "draft");
    assert.deepEqual(migration.record.metadata, draft.metadata);
    assert.deepEqual(migration.record.video, draft.video);
    assert.equal(cached[0].coverUrl, "data/library/covers/cover.webp");
    assert.ok(libraryRecords().some((item) => item.id === draft.id));
  } finally { globalThis.fetch = previousFetch; globalThis.indexedDB = previousDatabase; }
});
