const sessionStates = new Set([
  "idle",
  "starting",
  "playing",
  "paused",
  "buffering",
  "ended",
  "error",
]);
const incidentKinds = new Set([
  "response",
  "network",
  "startup",
  "buffering",
  "frames",
  "mediaError",
]);
const text = (value, limit = 160) =>
  typeof value === "string" ? value.slice(0, limit) : "";
const nonnegative = (value) =>
  Number.isFinite(value) && value >= 0 ? value : 0;
export function normalizeOperationRecord(collection, item) {
  if (
    !item ||
    typeof item !== "object" ||
    Array.isArray(item) ||
    typeof item.id !== "string"
  )
    return null;
  const id = text(item.id);
  if (!id) return null;
  if (collection === "sessions") {
    if (!text(item.titleId) || !text(item.title) || !text(item.region))
      return null;
    const result = {
      ...item,
      id,
      titleId: text(item.titleId),
      title: text(item.title),
      profileId: text(item.profileId),
      profileName: text(item.profileName),
      region: text(item.region, 2),
      quality: text(item.quality, 20),
      state: sessionStates.has(item.state) ? item.state : "idle",
      offline: item.offline === true,
    };
    for (const key of [
      "playedSeconds",
      "bufferingEvents",
      "bufferingMs",
      "currentTime",
      "duration",
      "totalFrames",
      "droppedFrames",
      "width",
      "height",
    ])
      result[key] = nonnegative(item[key]);
    result.droppedFrames = Math.min(result.totalFrames, result.droppedFrames);
    result.startupMs =
      Number.isFinite(item.startupMs) && item.startupMs >= 0
        ? item.startupMs
        : null;
    result.errorCode =
      Number.isInteger(item.errorCode) && item.errorCode > 0
        ? item.errorCode
        : null;
    return result;
  }
  if (collection === "probes") {
    if (!text(item.region) || typeof item.success !== "boolean") return null;
    return {
      ...item,
      id,
      region: text(item.region, 2),
      latency: item.success ? nonnegative(item.latency) : null,
      bytes: nonnegative(item.bytes),
    };
  }
  if (collection === "incidents") {
    if (!incidentKinds.has(item.kind) || !text(item.fingerprint)) return null;
    return {
      ...item,
      id,
      region: text(item.region, 2),
      status: ["open", "investigating", "resolved"].includes(item.status)
        ? item.status
        : "open",
      severity: item.severity === "critical" ? "critical" : "warning",
      notes: (Array.isArray(item.notes) ? item.notes : [])
        .filter((note) => note && typeof note.text === "string")
        .slice(-20)
        .map((note) => ({
          text: text(note.text, 500),
          time: text(note.time, 40),
        })),
    };
  }
  if (collection === "events") {
    if (!text(item.name)) return null;
    return {
      ...item,
      id,
      name: text(item.name),
      details: text(item.details, 1000),
    };
  }
  return null;
}
