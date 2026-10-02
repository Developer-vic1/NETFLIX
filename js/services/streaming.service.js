export const QUALITIES = Object.freeze([
  "Auto",
  "4K",
  "1080p",
  "720p",
  "480p",
  "360p",
]);
export function networkPreview(mbps, quality) {
  if (
    !["number", "string"].includes(typeof mbps) ||
    (typeof mbps === "string" && !mbps.trim())
  )
    throw new RangeError("Invalid simulation input");
  const speed = Number(mbps);
  if (
    !Number.isFinite(speed) ||
    speed < 0 ||
    speed > 100 ||
    !QUALITIES.includes(quality)
  )
    throw new RangeError("Invalid simulation input");
  // A technical input/output contract only. No automatic quality inference or real bandwidth measurement.
  return {
    simulated: true,
    mbps: speed,
    requestedQuality: quality,
    state: speed === 0 ? "offline" : "ready",
  };
}
