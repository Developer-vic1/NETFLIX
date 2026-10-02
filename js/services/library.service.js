import { titles } from "../data/titles.js";
import { activeProfile } from "./profile.service.js";
import { eventBus } from "./event-bus.service.js";
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
export async function validateMp4File(file) {
  if (
    !(file instanceof Blob) ||
    !file.size ||
    !/\.mp4$/i.test(file.name || "") ||
    (file.type && file.type !== "video/mp4")
  )
    throw new RangeError("library.mp4Required");
  const bytes = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
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
  return { brand: major, compatible };
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
  if (previous) previous.forEach((url) => URL.revokeObjectURL(url));
  const index = titles.findIndex((title) => title.id === record.id);
  if (index >= 0) titles.splice(index, 1);
  records.set(record.id, record);
  if (record.status !== "published" || record.invalidVideo) {
    urls.delete(record.id);
    return;
  }
  const video = URL.createObjectURL(record.video),
    poster = URL.createObjectURL(record.cover);
  urls.set(record.id, [video, poster]);
  titles.push(
    Object.freeze({
      ...record.metadata,
      id: record.id,
      type: "movies",
      poster,
      duration: record.media.duration,
      localAsset: video,
      qualities: [
        {
          quality: `${record.media.height}p`,
          url: video,
          bytes: record.video.size,
        },
      ],
      source: `#/title?title=${record.id}`,
      watchSource: video,
      licenseSource: `#/title?title=${record.id}`,
      isNew: true,
      uploaded: true,
      provenance: {
        type: "ADMIN_LOCAL_FILE",
        originalName: record.video.name,
        bytes: record.video.size,
        width: record.media.width,
        height: record.media.height,
        unchanged: true,
      },
    }),
  );
}
export async function loadLibrary() {
  const db = await openDatabase();
  const saved = await new Promise((resolve, reject) => {
    const request = db.transaction("films").objectStore("films").getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  for (const record of saved) {
    const invalidVideo = await validateMp4File(record.video).then(
      () => false,
      () => true,
    );
    install({ ...record, invalidVideo });
  }
}
export function libraryRecords() {
  return [...records.values()];
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
    !(video instanceof Blob) ||
    !video.size ||
    !/\.mp4$/i.test(video.name || "") ||
    (video.type && video.type !== "video/mp4") ||
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
export async function saveFilm({ id, metadata, video, cover, media, status }) {
  if (activeProfile().role !== "admin") throw new Error("admin.access");
  const valid = validateFilm(metadata, video, cover, media);
  await validateMp4File(video);
  if (!["draft", "published"].includes(status))
    throw new RangeError("library.invalid");
  if (id && !records.has(id)) throw new RangeError("library.invalid");
  const db = await openDatabase();
  const record = {
    id: id || `local-${crypto.randomUUID()}`,
    metadata: valid,
    video,
    cover,
    media: {
      duration: media.duration,
      width: media.width,
      height: media.height,
    },
    status,
    updatedAt: new Date().toISOString(),
  };
  await new Promise((resolve, reject) => {
    const tx = db.transaction("films", "readwrite");
    tx.objectStore("films").put(record);
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
  install(record);
  eventBus.emit("LIBRARY_UPDATED", record.id);
  return record;
}
export async function setFilmStatus(id, status) {
  if (activeProfile().role !== "admin") throw new Error("admin.access");
  const current = records.get(id);
  if (!current || !["draft", "published"].includes(status))
    throw new RangeError("library.invalid");
  return saveFilm({ ...current, status });
}
export async function inspectVideo(file) {
  const container = await validateMp4File(file);
  const url = URL.createObjectURL(file),
    video = document.createElement("video");
  video.preload = "auto";
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("library.videoError")),
        20000,
      );
      video.onloadeddata = () => {
        clearTimeout(timer);
        if (
          Number.isFinite(video.duration) &&
          video.duration > 0 &&
          video.videoWidth > 0
        )
          resolve({
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight,
            brand: container.brand,
          });
        else reject(new Error("library.videoError"));
      };
      video.onerror = () => {
        clearTimeout(timer);
        reject(new Error("library.videoError"));
      };
      video.src = url;
    });
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
