import { isStoredVideo } from "./media-upload.service.js";

export const MAX_COVER_BYTES = 12 * 1024 * 1024;
const COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const failure = (code) => new Error(code);

export function mergeLibraryRecords(cached = [], disk = []) {
  const result = new Map();
  for (const record of [...cached, ...disk]) {
    if (!record || typeof record.id !== "string") continue;
    const previous = result.get(record.id);
    const stamp = (item) => Date.parse(item?.updatedAt) || 0;
    // The durable copy wins ties; dates decide genuinely newer edits.
    if (!previous || stamp(record) >= stamp(previous)) result.set(record.id, record);
  }
  return [...result.values()];
}

function descriptor(video) {
  if (!isStoredVideo(video) || !Number.isSafeInteger(video.size) || video.size <= 0 || typeof video.name !== "string")
    throw failure("library.invalid");
  return { url: video.url, name: video.name, size: video.size };
}

export function libraryWireRecord(record) {
  if (!record || !["draft", "published"].includes(record.status)) throw failure("library.invalid");
  const base = {
    id: record.id,
    kind: record.kind || "movie",
    metadata: { ...record.metadata },
    status: record.status,
    updatedAt: record.updatedAt,
  };
  if (base.kind === "series") {
    base.episodes = record.episodes.map((episode) => ({
      id: episode.id, name: episode.name, description: episode.description,
      season: episode.season, number: episode.number,
      video: descriptor(episode.video), media: { ...episode.media },
    }));
  } else {
    base.video = descriptor(record.video);
    base.media = { ...record.media };
  }
  return base;
}

export async function encodeLibraryCover(cover) {
  if (!(cover instanceof Blob) || !cover.size || cover.size > MAX_COVER_BYTES || !COVER_TYPES.has(cover.type))
    throw failure("library.invalid");
  // Only the bounded image enters JS memory; MP4 data is never serialized here.
  const bytes = new Uint8Array(await cover.arrayBuffer());
  const segments = [];
  for (let index = 0; index < bytes.length; index += 32768)
    segments.push(String.fromCharCode(...bytes.subarray(index, index + 32768)));
  return { type: cover.type, data: btoa(segments.join("")) };
}

async function responseJson(response) {
  if (response.status === 404 || response.status === 405 || response.status === 501)
    throw failure("library.serverOutdated");
  if (!response.ok) throw failure(response.status === 507 ? "library.spaceError" : "library.catalogUnavailable");
  try { return await response.json(); }
  catch { throw failure("library.catalogUnavailable"); }
}

export async function readDiskLibrary({ fetcher = globalThis.fetch } = {}) {
  let response;
  try { response = await fetcher("/api/library", { cache: "no-store" }); }
  catch { throw failure("library.serverUnavailable"); }
  const data = await responseJson(response);
  if (!Array.isArray(data.records)) throw failure("library.catalogUnavailable");
  return data.records;
}

export async function writeDiskLibrary(record, { fetcher = globalThis.fetch } = {}) {
  const wire = libraryWireRecord(record);
  const cover = await encodeLibraryCover(record.cover);
  let response;
  try {
    response = await fetcher("/api/library", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ record: wire, cover }),
    });
  } catch { throw failure("library.serverUnavailable"); }
  const data = await responseJson(response);
  const saved = data.record || data;
  if (saved.id !== record.id || typeof saved.coverUrl !== "string") throw failure("library.catalogUnavailable");
  return { ...saved, cover: record.cover };
}

export async function hydrateDiskCover(record, cachedCover, { fetcher = globalThis.fetch } = {}) {
  if (record.cover instanceof Blob) return record;
  if (typeof record.coverUrl === "string" && record.coverUrl && !/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(record.coverUrl)) {
    try {
      const response = await fetcher(record.coverUrl, { cache: "no-store" });
      const length = Number(response.headers.get("Content-Length"));
      if (response.ok && (!length || length <= MAX_COVER_BYTES)) {
        const cover = await response.blob();
        if (cover.size && cover.size <= MAX_COVER_BYTES && COVER_TYPES.has(cover.type)) return { ...record, cover };
      }
    } catch { /* A complete browser cache remains available during a server outage. */ }
  }
  if (cachedCover instanceof Blob && cachedCover.size <= MAX_COVER_BYTES && COVER_TYPES.has(cachedCover.type))
    return { ...record, cover: cachedCover };
  throw failure("library.coverUnavailable");
}
