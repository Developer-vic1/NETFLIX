export function finiteValues(values) {
  return values.filter(
    (value) =>
      typeof value === "number" && Number.isFinite(value) && value >= 0,
  );
}
export function mean(values) {
  const valid = finiteValues(values);
  return valid.length
    ? valid.reduce((sum, value) => sum + value, 0) / valid.length
    : null;
}
export function percentile(values, fraction = 0.95) {
  const valid = finiteValues(values).sort((a, b) => a - b);
  if (!valid.length) return null;
  return valid[
    Math.max(
      0,
      Math.min(valid.length - 1, Math.ceil(valid.length * fraction) - 1),
    )
  ];
}
export function summarizeSessions(sessions) {
  const played = sessions.filter((item) => item.playedSeconds > 0);
  const totalFrames = played.reduce(
    (sum, item) => sum + (item.totalFrames || 0),
    0,
  );
  const dropped = played.reduce(
    (sum, item) => sum + (item.droppedFrames || 0),
    0,
  );
  return {
    count: played.length,
    playedSeconds: played.reduce((sum, item) => sum + item.playedSeconds, 0),
    bufferingEvents: played.reduce(
      (sum, item) => sum + (item.bufferingEvents || 0),
      0,
    ),
    bufferingMs: played.reduce((sum, item) => sum + (item.bufferingMs || 0), 0),
    startupP95: percentile(played.map((item) => item.startupMs)),
    droppedPercent: totalFrames ? (dropped / totalFrames) * 100 : null,
    errors: sessions.filter((item) => item.state === "error" || item.errorCode)
      .length,
    completed: played.filter((item) => item.state === "ended").length,
  };
}
export function compareSessions(first, second) {
  const difference = (key) =>
    Number.isFinite(first?.[key]) && Number.isFinite(second?.[key])
      ? second[key] - first[key]
      : null;
  return {
    startupMs: difference("startupMs"),
    bufferingMs: difference("bufferingMs"),
    bufferingEvents: difference("bufferingEvents"),
    droppedFrames: difference("droppedFrames"),
  };
}
