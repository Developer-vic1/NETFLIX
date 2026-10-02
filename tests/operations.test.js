import test from "node:test";
import assert from "node:assert/strict";
import {
  mean,
  percentile,
  summarizeSessions,
  compareSessions,
} from "../js/utils/statistics.js";
import { normalizeOperationRecord } from "../js/utils/operations-records.js";
import { toCsv } from "../js/utils/export.js";
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
};
const store = await import("../js/services/operations-store.service.js");
test("statistics exclude unknown values and use a weighted frame percentage", () => {
  assert.equal(mean([10, null, -1, NaN, Infinity, 30]), 20);
  assert.equal(percentile([]), null);
  assert.equal(percentile([1, 2, 3, 4, 100]), 100);
  const summary = summarizeSessions([
    { playedSeconds: 1, totalFrames: 100, droppedFrames: 10, startupMs: 100 },
    { playedSeconds: 9, totalFrames: 900, droppedFrames: 0, startupMs: 300 },
    { playedSeconds: 0, startupMs: 9999 },
  ]);
  assert.equal(summary.droppedPercent, 1);
  assert.equal(summary.startupP95, 300);
  assert.equal(summary.count, 2);
  assert.equal(summary.playedSeconds, 10);
  assert.equal(
    compareSessions({ startupMs: 300 }, { startupMs: 100 }).startupMs,
    -200,
  );
  assert.equal(compareSessions({}, {}).startupMs, null);
});
test("stored records recover from missing notes and reject unknown incident kinds", () => {
  const incident = normalizeOperationRecord("incidents", {
    id: "one",
    kind: "buffering",
    fingerprint: "one:buffering",
    notes: null,
    status: "bad",
  });
  assert.deepEqual(incident.notes, []);
  assert.equal(incident.status, "open");
  assert.equal(
    normalizeOperationRecord("incidents", { id: "two", kind: "fake" }),
    null,
  );
  const session = normalizeOperationRecord("sessions", {
    id: "s",
    title: "Sintel",
    titleId: "sintel",
    region: "BO",
    playedSeconds: "NaN",
    totalFrames: 10,
    droppedFrames: 50,
  });
  assert.equal(session.playedSeconds, 0);
  assert.equal(session.droppedFrames, 10);
  assert.equal(session.startupMs, null);
});
test("operations retain bounded records, isolate snapshots and persist thresholds", () => {
  for (let index = 0; index < 130; index++)
    store.recordSession({
      id: String(index),
      title: "Sintel",
      titleId: "sintel",
      region: "BO",
      playedSeconds: 1,
    });
  assert.equal(
    store.operationsSnapshot().sessions.length,
    store.OPS_LIMITS.sessions,
  );
  const copy = store.operationsSnapshot();
  copy.sessions.length = 0;
  assert.equal(store.operationsSnapshot().sessions.length, 120);
  assert.throws(
    () => store.saveThresholds({ ...store.DEFAULT_THRESHOLDS, responseMs: 0 }),
    RangeError,
  );
  store.saveThresholds({ ...store.DEFAULT_THRESHOLDS, responseMs: 500 });
  assert.equal(
    JSON.parse(storage.get("nsip.operations.v1")).thresholds.responseMs,
    500,
  );
});
test("incident workflow deduplicates observations and bounds notes", () => {
  const issue = {
    fingerprint: "session:buffering",
    kind: "buffering",
    region: "BO",
    value: 3,
    threshold: 3,
  };
  const first = store.upsertIncident(issue);
  assert.equal(store.upsertIncident(issue).id, first.id);
  for (let index = 0; index < 25; index++)
    store.updateIncident(first.id, {
      status: "investigating",
      note: "x".repeat(600),
    });
  store.updateIncident(first.id, { status: "resolved" });
  const saved = store
    .operationsSnapshot()
    .incidents.find((item) => item.id === first.id);
  assert.equal(saved.notes.length, 20);
  assert.equal(saved.notes[0].text.length, 500);
  assert.equal(saved.status, "resolved");
});
test("CSV escapes delimiters and neutralizes spreadsheet formulas including leading whitespace", () => {
  const csv = toCsv(
    [{ title: 'a,"b"', profile: "=SUM(A1)", note: " \t+COMMAND" }],
    ["title", "profile", "note"],
  );
  assert.ok(csv.includes('"a,""b"""'));
  assert.ok(csv.includes('"\'=SUM(A1)"'));
  assert.ok(csv.includes('"\' \t+COMMAND"'));
  assert.ok(csv.startsWith("\uFEFF"));
});
test("storage failures are reported without discarding in-memory observations", () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    setItem() {
      throw new Error("quota");
    },
  };
  try {
    assert.equal(store.flushOperations(), false);
    assert.equal(store.operationsSnapshot().writable, false);
    assert.equal(store.operationsSnapshot().sessions.length, 120);
  } finally {
    globalThis.localStorage = original;
    store.flushOperations();
  }
});
