import test from "node:test";
import assert from "node:assert/strict";
import { formatTime, formatDuration } from "../js/utils/time.js";

test("playback clock carries minutes into hours", () => {
  assert.equal(formatTime(3599), "59:59");
  assert.equal(formatTime(3600), "1:00:00");
  assert.equal(formatTime(8678.016), "2:24:38");
});
test("invalid or negative playback time never renders NaN", () => {
  for (const value of [NaN, Infinity, undefined, -10])
    assert.equal(formatTime(value), "00:00");
});
test("catalog duration separates hours and remaining minutes", () => {
  assert.equal(formatDuration(8678.016, "es"), "2 h 24 min");
  assert.equal(formatDuration(3600, "it"), "1 h");
  assert.equal(formatDuration(146, "en"), "2 min");
});
