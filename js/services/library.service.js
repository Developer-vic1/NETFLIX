import { titles } from "../data/titles.js";
import { activeProfile } from "./profile.service.js";
import { eventBus } from "./event-bus.service.js";
import { transfers } from "./transfer-tasks.service.js";
import { MEDIA_CACHE } from "./download.service.js";
import { isStoredVideo as stored, isNativeSource, uploadVideo, MAX_VIDEO_BYTES } from "./media-upload.service.js";
const records = new Map(),
  urls = new Map();
let database;
const brands = new Set([
  "isom",
  "iso2",
  "iso3",
  "iso4",
  "iso5",
  "iso6",
  "mp41",
  "mp42",
  "avc1",
  "dash",
  "M4V ",
]);
const readCode = (bytes, start) =>
  String.fromCharCode(...bytes.slice(start, start + 4));
const videoUrl = (video) => stored(video) ? video.url : URL.createObjectURL(video);
const validatedFiles = new WeakMap();
export async function validateMp4File(file, { signal } = {}) {
  signal?.throwIfAborted();
  if (
    (!(file instanceof Blob) && !isNativeSource(file)) ||
    !file.size ||
    !/\.mp4$/i.test(file.name || "") ||
    (file.type && file.type !== "video/mp4")
  )
    throw new RangeError("library.mp4Required");
  if (file.size > MAX_VIDEO_BYTES) throw new RangeError("library.videoTooLarge");
  if (validatedFiles.has(file)) return validatedFiles.get(file);
  let buffer;
  if (isNativeSource(file)) {
    const response = await fetch(file.url, { headers: { Range: "bytes=0-4095" }, cache: "no-store", signal });
    if (!response.ok) throw new Error("library.sourceUnavailable");
    buffer = await response.arrayBuffer();
  } else buffer = await file.slice(0, 4096).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 20 || readCode(bytes, 4) !== "ftyp")
    throw new RangeError("library.mp4Invalid");
  const view = new DataView(bytes.buffer),
    small = view.getUint32(0);
  const extended = small === 1;
  const length = extended ? Number(view.getBigUint64(8)) : small;
  const offset = extended ? 16 : 8;
  if (
    !Number.isSafeInteger(length) ||
    length < offset + 8 ||
    length > bytes.length ||
    length > file.size ||
    (length - offset - 8) % 4
  )
    throw new RangeError("library.mp4Invalid");
  const major = readCode(bytes, offset),
    compatible = [];
  for (let index = offset + 8; index < length; index += 4)
    compatible.push(readCode(bytes, index));
  if (
    major === "qt  " ||
    ![major, ...compatible].some((brand) => brands.has(brand))
  )
    throw new RangeError("library.mp4Invalid");
  const result = { brand: major, compatible };
  validatedFiles.set(file, result);
  return result;
}
function openDatabase() {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open("netflix-library", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("films", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
  });
  return database;
}
function install(record) {
  const previous = urls.get(record.id);
  if (previous) previous.forEach((url) => { if (url.startsWith("blob:")) URL.revokeObjectURL(url); });
  const index = titles.findIndex((title) => title.id === record.id);
  if (index >= 0) titles.splice(index, 1);
  for (let i = titles.length - 1; i >= 0; i--) if (titles[i].seriesId === record.id) titles.splice(i, 1);
  records.set(record.id, record);
  if (record.status !== "published" || record.invalidVideo) {
    urls.delete(record.id);
    return;
  }
  const isSeries = record.kind === "series";
  const episodes = isSeries
    ? [...record.episodes].sort(
        (a, b) => a.season - b.season || a.number - b.number,
      )
    : [];
  const first = episodes[0];
  const video = videoUrl(isSeries ? first.video : record.video),
    poster = URL.createObjectURL(record.cover);
  const episodeUrls = episodes.map((episode, index) =>
    index === 0 ? video : videoUrl(episode.video),
  );
  urls.set(record.id, [video, poster, ...episodeUrls.slice(1)]);
  titles.push(
    Object.freeze({
      ...record.metadata,
      id: record.id,
      type: isSeries ? "series" : "movies",
      poster,
      duration: isSeries ? first.media.duration : record.media.duration,
      localAsset: video,
      episodes: isSeries
        ? episodes.map((episode, index) => ({
            id: episode.id,
            name: episode.name,
            description: episode.description,
            season: episode.season,
            number: episode.number,
            duration: episode.media.duration,
            media: episode.media,
            localAsset: episodeUrls[index],
            poster,
            qualities: [{
              quality: `${episode.media.height}p`,
              url: episodeUrls[index],
              bytes: episode.video.size,
            }],
          }))
        : undefined,
      qualities: [
        {
          quality: `${(isSeries ? first : record).media.height}p`,
          url: video,
          bytes: (isSeries ? first : record).video.size,
        },
      ],
      source: `#/title?title=${record.id}`,
      watchSource: video,
      licenseSource: `#/title?title=${record.id}`,
      isNew: true,
      uploaded: true,
      provenance: {
        type: "ADMIN_LOCAL_FILE",
        originalName: (isSeries ? first : record).video.name,
        bytes: (isSeries ? first : record).video.size,
        width: (isSeries ? first : record).media.width,
        height: (isSeries ? first : record).media.height,
        unchanged: true,
      },
    }),
  );
  if (isSeries) for (const episode of episodes) {
    const url = episodeUrls[episodes.indexOf(episode)];
    titles.push(Object.freeze({
      ...record.metadata, id: episode.id, seriesId: record.id,
      type: "episode", name: episode.name, description: episode.description,
      season: episode.season, number: episode.number, poster,
      duration: episode.media.duration, localAsset: url, watchSource: url,
      qualities: [{ quality: `${episode.media.height}p`, url, bytes: episode.video.size }],
      source: `#/title?title=${record.id}`, licenseSource: `#/title?title=${record.id}`,
      uploaded: true,
    }));
  }
}
export async function loadLibrary() {
  const db = await openDatabase();
  const saved = await new Promise((resolve, reject) => {
    const request = db.transaction("films").objectStore("films").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  for (const record of saved) {
    const videos = record.kind === "series"
      ? (record.episodes || []).map((episode) => episode.video)
      : [record.video];
    const invalidVideo = !videos.length || (await Promise.all(
      videos.map(async (video) => {
        if (!stored(video)) return validateMp4File(video).then(() => false, () => true);
        try { if ((await fetch(video.url, { method: "HEAD" })).ok) return false; } catch { /* Check a completed offline download. */ }
        if (typeof caches !== "undefined") {
          try {
            const cache = await caches.open(MEDIA_CACHE);
            if ((await cache.match(new URL(video.url, location.href).href))?.ok) return false;
          } catch { /* An unavailable cache does not make a missing file playable. */ }
        }
        return true;
      }),
    )).some(Boolean);
    install({ ...record, invalidVideo });
  }
}
export function libraryRecords() {
  return [...records.values()];
}
export function seriesRecords() {
  return libraryRecords().filter((record) => record.kind === "series");
}
export function validateFilm(metadata, video, cover, media) {
  for (const [key, min, max] of [
    ["name", 1, 100],
    ["description", 20, 2000],
    ["creator", 1, 160],
    ["genre", 1, 60],
  ]) {
    if (
      typeof metadata[key] !== "string" ||
      metadata[key].trim().length < min ||
      metadata[key].length > max
    )
      throw new RangeError("library.invalid");
  }
  if (
    !Number.isInteger(metadata.year) ||
    metadata.year < 1888 ||
    metadata.year > new Date().getFullYear() + 5 ||
    !["all", "7+", "13+", "16+", "18+"].includes(metadata.ageRating) ||
    !["es", "en", "it", "ar", "other"].includes(metadata.originalLanguage)
  )
    throw new RangeError("library.invalid");
  if (
    !(stored(video) || ((video instanceof Blob || isNativeSource(video)) && video.size && /\.mp4$/i.test(video.name || "") && (!video.type || video.type === "video/mp4"))) ||
    !(cover instanceof Blob) ||
    !cover.size ||
    cover.size > 12 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp"].includes(cover.type)
  )
    throw new RangeError("library.invalid");
  if (
    !Number.isFinite(media?.duration) ||
    media.duration <= 0 ||
    !Number.isInteger(media.width) ||
    !Number.isInteger(media.height) ||
    media.width <= 0 ||
    media.height <= 0
  )
    throw new RangeError("library.invalid");
  return Object.fromEntries(
    [
      "name",
      "description",
      "creator",
      "genre",
      "year",
      "ageRating",
      "originalLanguage",
    ].map((key) => [
      key,
      typeof metadata[key] === "string" ? metadata[key].trim() : metadata[key],
    ]),
  );
}
async function persistRecord(record, profileId) {
  const paths = (item) => (item.kind === "series" ? item.episodes.map((episode) => episode.video.url) : [item.video.url]).sort().join("|");
  if (!records.has(record.id)) {
    const existing = [...records.values()].find((item) => (item.kind || "movie") === record.kind && paths(item) === paths(record));
    if (existing) record = { ...record, id: existing.id, ...(record.kind === "series" ? { episodes: record.episodes.map((episode) => ({ ...episode, id: existing.episodes.find((previous) => previous.season === episode.season && previous.number === episode.number)?.id || episode.id })) } : {}) };
  }
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("films", "readwrite");
    tx.objectStore("films").put(record);
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
  install(record);
  eventBus.emit("LIBRARY_UPDATED", record.id, { profileId });
  return record;
}
function runSave(descriptor, operation, onTask) {
  if (!descriptor.fileCount) return operation();
  const task = transfers.enqueue(descriptor, operation);
  onTask?.(task.id);
  return task.promise;
}
export async function saveFilm({ id, metadata, video, cover, media, status }, { onTask } = {}) {
  if (activeProfile().role !== "admin") throw new Error("admin.access");
  const profileId = activeProfile().id;
  const valid = validateFilm(metadata, video, cover, media);
  if (!["draft", "published"].includes(status))
    throw new RangeError("library.invalid");
  if (id && !records.has(id)) throw new RangeError("library.invalid");
  const recordId = id || `local-${crypto.randomUUID()}`;
  const info = { duration: media.duration, width: media.width, height: media.height };
  return runSave({ name: valid.name, kind: "movie", profileId, total: stored(video) ? 0 : video.size, fileCount: stored(video) ? 0 : 1 }, async (task) => {
    task?.checkpoint();
    if (!stored(video)) await validateMp4File(video, { signal: task?.signal });
    task?.update({ phase: "uploading", filename: video.name, fileIndex: 1 });
    const saved = await uploadVideo(video, { title: valid.name, kind: "movie", signal: task?.signal, onProgress: (progress) => task?.update(progress) });
    task?.commit();
    return persistRecord({ id: recordId, kind: "movie", metadata: valid, video: saved, cover, media: info, status, updatedAt: new Date().toISOString() }, profileId);
  }, onTask);
}
export async function setFilmStatus(id, status) {
  if (activeProfile().role !== "admin") throw new Error("admin.access");
  const current = records.get(id);
  if (!current || !["draft", "published"].includes(status))
    throw new RangeError("library.invalid");
  return current.kind === "series"
    ? saveSeries({ ...current, status })
    : saveFilm({ ...current, status });
}
export function validateEpisode(episode) {
  if (
    !episode ||
    typeof episode.name !== "string" ||
    !episode.name.trim() ||
    episode.name.length > 120 ||
    typeof episode.description !== "string" ||
    episode.description.length > 1000 ||
    !Number.isInteger(episode.season) ||
    episode.season < 1 ||
    episode.season > 99 ||
    !Number.isInteger(episode.number) ||
    episode.number < 1 ||
    episode.number > 999 ||
    !Number.isFinite(episode.media?.duration) ||
    episode.media.duration <= 0 ||
    !Number.isInteger(episode.media?.width) ||
    episode.media.width < 1 ||
    !Number.isInteger(episode.media?.height) ||
    episode.media.height < 1
  ) throw new RangeError("library.invalid");
  return {
    id: episode.id || `episode-${crypto.randomUUID()}`,
    name: episode.name.trim(),
    description: episode.description.trim(),
    season: episode.season,
    number: episode.number,
    video: episode.video,
    media: episode.media,
  };
}
export async function saveSeries({ id, metadata, cover, episodes, status }, { onTask } = {}) {
  if (activeProfile().role !== "admin") throw new Error("admin.access");
  const profileId = activeProfile().id;
  if (!Array.isArray(episodes) || !episodes.length || !["draft", "published"].includes(status))
    throw new RangeError("library.invalid");
  const checked = episodes.map(validateEpisode);
  const slots = new Set();
  const identifiers = new Set();
  for (const episode of checked) {
    const slot = `${episode.season}:${episode.number}`;
    if (slots.has(slot) || identifiers.has(episode.id))
      throw new RangeError("library.duplicateEpisode");
    slots.add(slot);
    identifiers.add(episode.id);
  }
  const valid = validateFilm(metadata, checked[0].video, cover, checked[0].media);
  if (id && (!records.has(id) || records.get(id).kind !== "series"))
    throw new RangeError("library.invalid");
  const recordId = id || `local-series-${crypto.randomUUID()}`;
  const fresh = checked.filter((episode) => !stored(episode.video));
  return runSave({ name: valid.name, kind: "series", profileId, total: fresh.reduce((sum, episode) => sum + episode.video.size, 0), fileCount: fresh.length }, async (task) => {
    for (const episode of fresh) { task?.checkpoint(); await validateMp4File(episode.video, { signal: task?.signal }); }
    let sent = 0, index = 0;
    const savedEpisodes = [];
    for (const episode of checked) {
      task?.checkpoint();
      const freshFile = !stored(episode.video);
      if (freshFile) task?.update({ phase: "uploading", filename: episode.video.name, fileIndex: ++index });
      const uploaded = await uploadVideo(episode.video, { title: valid.name, kind: "series", season: episode.season, number: episode.number, signal: task?.signal, onProgress: (progress) => task?.update({ ...progress, loaded: sent + progress.loaded }) });
      if (freshFile) sent += episode.video.size;
      savedEpisodes.push({ ...episode, video: uploaded });
    }
    task?.commit();
    return persistRecord({ id: recordId, kind: "series", metadata: valid, cover, episodes: savedEpisodes, status, updatedAt: new Date().toISOString() }, profileId);
  }, onTask);
}
export async function inspectVideo(file, { signal } = {}) {
  const container = await validateMp4File(file, { signal });
  const local = isNativeSource(file);
  const url = local ? file.url : URL.createObjectURL(file),
    video = document.createElement("video");
  video.preload = "metadata";
  try {
    return await new Promise((resolve, reject) => {
      let finished = false;
      const finish = (error, result) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        video.onloadeddata = video.onloadedmetadata = video.onseeked = video.onerror = null;
        error ? reject(error) : resolve(result);
      };
      const abort = () => finish(new DOMException("Validation cancelled", "AbortError"));
      const timer = setTimeout(() => finish(new Error("library.videoError")), 60000);
      const frame = () => {
        if (
          Number.isFinite(video.duration) &&
          video.duration > 0 &&
          video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2
        )
          finish(null, {
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight,
            brand: container.brand,
          });
      };
      video.onloadedmetadata = () => {
        if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth) {
          finish(new Error("library.videoError")); return;
        }
        // Seek only a first frame; a long movie never needs to be fully decoded.
        video.currentTime = Math.min(0.01, video.duration / 2);
        frame();
      };
      video.onloadeddata = video.onseeked = frame;
      video.onerror = () => finish(new Error("library.videoError"));
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      video.src = url;
      video.load();
    });
  } finally {
    video.removeAttribute("src");
    video.load();
    if (!local) URL.revokeObjectURL(url);
  }
}
