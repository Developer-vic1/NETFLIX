import { normalizeOperationRecord } from "../utils/operations-records.js";
const KEY = "nsip.operations.v1";
export const OPS_LIMITS = Object.freeze({
  sessions: 120,
  probes: 240,
  incidents: 80,
  events: 160,
});
export const DEFAULT_THRESHOLDS = Object.freeze({
  responseMs: 1000,
  startupMs: 3000,
  bufferingEvents: 3,
  droppedPercent: 2,
});
const ranges = {
  responseMs: [10, 60000],
  startupMs: [100, 60000],
  bufferingEvents: [1, 100],
  droppedPercent: [0.1, 100],
};
const empty = () => ({
  sessions: [],
  probes: [],
  incidents: [],
  events: [],
  thresholds: { ...DEFAULT_THRESHOLDS },
});
let state;
let writable = true;
const subscribers = new Set();
function validObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (!validObject(saved)) return empty();
    const result = empty();
    for (const [key, limit] of Object.entries(OPS_LIMITS)) {
      if (Array.isArray(saved[key]))
        result[key] = saved[key]
          .map((item) => normalizeOperationRecord(key, item))
          .filter(Boolean)
          .slice(-limit);
    }
    if (validObject(saved.thresholds))
      for (const key of Object.keys(DEFAULT_THRESHOLDS)) {
        const value = saved.thresholds[key];
        if (
          Number.isFinite(value) &&
          value >= ranges[key][0] &&
          value <= ranges[key][1]
        )
          result.thresholds[key] = value;
      }
    return result;
  } catch {
    return empty();
  }
}
state = load();
let persistTimer;
function notify() {
  for (const listener of subscribers) {
    try {
      listener();
    } catch {}
  }
}
export function flushOperations() {
  clearTimeout(persistTimer);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    writable = true;
  } catch {
    writable = false;
  }
  return writable;
}
function changed(immediate = false) {
  clearTimeout(persistTimer);
  if (immediate) flushOperations();
  else persistTimer = setTimeout(flushOperations, 350);
  notify();
}
export function operationsSnapshot() {
  return { ...structuredClone(state), writable };
}
export function subscribeOperations(listener) {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}
export function recordSession(session, immediate = false) {
  if (!session || typeof session.id !== "string") return;
  const index = state.sessions.findIndex((item) => item.id === session.id);
  if (index === -1) state.sessions.push({ ...session });
  else state.sessions[index] = { ...state.sessions[index], ...session };
  state.sessions = state.sessions.slice(-OPS_LIMITS.sessions);
  changed(immediate);
}
export function recordProbe(probe) {
  state.probes.push({
    ...probe,
    id: crypto.randomUUID(),
    time: new Date().toISOString(),
  });
  state.probes = state.probes.slice(-OPS_LIMITS.probes);
  changed();
}
export function recordOperationEvent(event) {
  state.events.push({
    ...event,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  });
  state.events = state.events.slice(-OPS_LIMITS.events);
  changed();
}
export function saveThresholds(values) {
  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (!Number.isFinite(values[key]) || values[key] < min || values[key] > max)
      throw new RangeError("Invalid threshold");
  }
  state.thresholds = { ...values };
  changed(true);
}
export function upsertIncident(incident) {
  const existing = state.incidents.find(
    (item) => item.fingerprint === incident.fingerprint,
  );
  if (existing) return existing;
  const item = {
    ...incident,
    id: crypto.randomUUID(),
    status: "open",
    createdAt: new Date().toISOString(),
    notes: [],
  };
  state.incidents.push(item);
  state.incidents = state.incidents.slice(-OPS_LIMITS.incidents);
  changed(true);
  return item;
}
export function updateIncident(id, changes) {
  const item = state.incidents.find((item) => item.id === id);
  if (!item) return false;
  if (
    changes.status &&
    ["open", "investigating", "resolved"].includes(changes.status)
  )
    item.status = changes.status;
  if (typeof changes.note === "string" && changes.note.trim())
    item.notes = [
      ...item.notes,
      {
        text: changes.note.trim().slice(0, 500),
        time: new Date().toISOString(),
      },
    ].slice(-20);
  item.updatedAt = new Date().toISOString();
  changed(true);
  return true;
}
if (typeof window !== "undefined")
  window.addEventListener("pagehide", flushOperations);
