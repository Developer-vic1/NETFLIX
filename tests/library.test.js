import test from "node:test";
import assert from "node:assert/strict";
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, value),
};
const { validateFilm, validateMp4File, saveFilm } =
  await import("../js/services/library.service.js");
const metadata = {
  name: "Mi película",
  description: "Una historia con una descripción completa.",
  creator: "Carla Encinas",
  genre: "Aventura",
  year: 2026,
  ageRating: "13+",
  originalLanguage: "es",
};
const header = Buffer.from(
  "000000206674797069736f6d0000020069736f6d69736f32617663316d703431",
  "hex",
);
const video = new File([header], "clip.mp4", { type: "video/mp4" }),
  cover = new Blob(["cover"], { type: "image/webp" }),
  media = { duration: 123, width: 1920, height: 1080 };
test("film metadata rejects invalid fields, classifications and media", () => {
  assert.equal(
    validateFilm({ ...metadata, name: " Mi película " }, video, cover, media)
      .name,
    "Mi película",
  );
  for (const change of [
    { description: "short" },
    { year: 1600 },
    { ageRating: "unknown" },
    { originalLanguage: "unknown" },
    { name: "" },
  ])
    assert.throws(() =>
      validateFilm({ ...metadata, ...change }, video, cover, media),
    );
  assert.throws(() =>
    validateFilm(
      metadata,
      video,
      new Blob(["svg"], { type: "image/svg+xml" }),
      media,
    ),
  );
  assert.throws(() =>
    validateFilm(metadata, video, cover, { ...media, duration: Infinity }),
  );
  assert.throws(() => validateFilm(metadata, new Blob([]), cover, media));
});
test("MP4 container validation rejects renamed WebM, QuickTime and truncated ftyp", async () => {
  assert.equal((await validateMp4File(video)).brand, "isom");
  await assert.rejects(
    validateMp4File(new File([header], "clip.webm", { type: "video/webm" })),
    /library.mp4Required/,
  );
  await assert.rejects(
    validateMp4File(new File(["fake"], "clip.mp4", { type: "video/mp4" })),
    /library.mp4Invalid/,
  );
  const quicktime = Buffer.from(header);
  quicktime.write("qt  ", 8);
  await assert.rejects(
    validateMp4File(new File([quicktime], "clip.mp4", { type: "video/mp4" })),
    /library.mp4Invalid/,
  );
  await assert.rejects(
    validateMp4File(new File([header], "clip.mp4", { type: "video/webm" })),
    /library.mp4Required/,
  );
});
test("a viewer cannot write into the film library", async () => {
  await assert.rejects(
    saveFilm({ metadata, video, cover, media, status: "published" }),
    /admin.access/,
  );
});
