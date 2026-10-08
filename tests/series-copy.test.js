import test from "node:test";
import assert from "node:assert/strict";
import { seriesCopy } from "../js/data/series-copy.js";

test("series fields and feedback have Spanish, Italian, English and Arabic copy", () => {
  const keys = ["add", "edit", "episodeTitle", "addEpisode", "duplicate", "invalidVideo", "saving", "published", "server"];
  for (const language of ["es", "it", "en", "ar"])
    for (const key of keys) assert.ok(seriesCopy(language, key)?.trim());
  assert.equal(seriesCopy("it", "addEpisode"), "Aggiungi episodio");
});
