import test from "node:test";
import assert from "node:assert/strict";
import { catalogTitles, titles } from "../js/data/titles.js";

test("general catalog lists the series once while keeping its episodes addressable", () => {
  const series = { id: "qa-series", type: "series", episodes: [{ id: "qa-episode" }] };
  const episode = { id: "qa-episode", type: "episode", seriesId: series.id, isNew: true };
  const movie = { id: "qa-movie", type: "movies" };
  const records = [series, episode, movie];
  assert.deepEqual(catalogTitles(records), [series, movie]);
  assert.equal(records.find((item) => item.id === "qa-episode"), episode);
  assert.equal(catalogTitles(records).filter((item) => item.isNew).length, 0);
  assert.deepEqual(catalogTitles(), titles.filter((item) => item.type !== "episode"));
});
