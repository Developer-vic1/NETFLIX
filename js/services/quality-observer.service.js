import { activeProfile } from "./profile.service.js";
import { getLocalization } from "./localization.service.js";
import {
  recordSession,
  operationsSnapshot,
  upsertIncident,
} from "./operations-store.service.js";
export function evaluateQuality(
  record,
  thresholds = operationsSnapshot().thresholds,
) {
  const issues = [];
  if (
    Number.isFinite(record.startupMs) &&
    record.startupMs > thresholds.startupMs
  )
    issues.push({
      kind: "startup",
      value: record.startupMs,
      threshold: thresholds.startupMs,
    });
  if (record.bufferingEvents >= thresholds.bufferingEvents)
    issues.push({
      kind: "buffering",
      value: record.bufferingEvents,
      threshold: thresholds.bufferingEvents,
    });
  const dropped =
    record.totalFrames > 0
      ? (record.droppedFrames / record.totalFrames) * 100
      : null;
  if (dropped !== null && dropped > thresholds.droppedPercent)
    issues.push({
      kind: "frames",
      value: dropped,
      threshold: thresholds.droppedPercent,
    });
  if (record.errorCode)
    issues.push({
      kind: "mediaError",
      value: record.errorCode,
      threshold: null,
    });
  return issues;
}
export function observePlayback(video, title, qualitySelect) {
  const profile = activeProfile(),
    region = getLocalization().region;
  const id = crypto.randomUUID();
  let firstPlayAt = null,
    bufferStart = null,
    lastPlayingAt = null,
    lastPersist = 0,
    seekInProgress = false,
    disposed = false;
  let framesOffset = 0,
    droppedOffset = 0,
    previousFrames = 0,
    previousDropped = 0;
  const record = {
    id,
    titleId: title.id,
    title: title.name,
    profileId: profile.id,
    profileName: profile.name,
    region,
    language: getLocalization().language,
    quality: qualitySelect.value,
    state: "idle",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    startupMs: null,
    playedSeconds: 0,
    bufferingEvents: 0,
    bufferingMs: 0,
    currentTime: 0,
    duration: title.duration,
    totalFrames: 0,
    droppedFrames: 0,
    width: 0,
    height: 0,
    offline: !navigator.onLine,
    errorCode: null,
  };
  const listeners = [];
  const listen = (name, callback) => {
    video.addEventListener(name, callback);
    listeners.push([name, callback]);
  };
  const clock = () => performance.now();
  function finishBuffer() {
    if (bufferStart !== null) {
      record.bufferingMs += Math.max(0, clock() - bufferStart);
      bufferStart = null;
    }
  }
  function accumulate() {
    const now = clock();
    if (
      lastPlayingAt !== null &&
      !video.paused &&
      !video.seeking &&
      !seekInProgress &&
      record.state === "playing"
    )
      record.playedSeconds += Math.min(
        2,
        Math.max(0, (now - lastPlayingAt) / 1000),
      );
    lastPlayingAt = now;
  }
  function persist(immediate = false) {
    if (disposed) return;
    const quality = video.getVideoPlaybackQuality?.();
    if (quality) {
      if (quality.totalVideoFrames < previousFrames) {
        framesOffset += previousFrames;
        droppedOffset += previousDropped;
      }
      previousFrames = quality.totalVideoFrames;
      previousDropped = quality.droppedVideoFrames;
      record.totalFrames = framesOffset + previousFrames;
      record.droppedFrames = droppedOffset + previousDropped;
    }
    Object.assign(record, {
      currentTime: video.currentTime,
      duration: Number.isFinite(video.duration)
        ? video.duration
        : title.duration,
      width: video.videoWidth || record.width,
      height: video.videoHeight || record.height,
      quality: qualitySelect.value,
      updatedAt: new Date().toISOString(),
    });
    const now = clock();
    if (!immediate && now - lastPersist < 1000) return;
    lastPersist = now;
    recordSession(record, immediate);
    for (const issue of evaluateQuality(record))
      upsertIncident({
        fingerprint: `${id}:${issue.kind}`,
        sessionId: id,
        titleId: title.id,
        region,
        kind: issue.kind,
        severity: issue.kind === "mediaError" ? "critical" : "warning",
        value: issue.value,
        threshold: issue.threshold,
      });
  }
  listen("play", () => {
    if (firstPlayAt === null) firstPlayAt = clock();
    record.state = "starting";
    persist(true);
  });
  listen("playing", () => {
    finishBuffer();
    if (record.startupMs === null && firstPlayAt !== null)
      record.startupMs = clock() - firstPlayAt;
    record.state = "playing";
    lastPlayingAt = clock();
    persist(true);
  });
  listen("timeupdate", () => {
    accumulate();
    persist();
  });
  listen("waiting", () => {
    if (
      !video.paused &&
      !seekInProgress &&
      !video.seeking &&
      record.startupMs !== null &&
      bufferStart === null
    ) {
      accumulate();
      bufferStart = clock();
      record.bufferingEvents++;
      record.state = "buffering";
      persist(true);
    }
  });
  listen("seeking", () => {
    seekInProgress = true;
    finishBuffer();
    lastPlayingAt = null;
  });
  listen("seeked", () => {
    seekInProgress = false;
    lastPlayingAt = clock();
    persist(true);
  });
  listen("pause", () => {
    finishBuffer();
    lastPlayingAt = null;
    record.state = "paused";
    persist(true);
  });
  listen("ended", () => {
    finishBuffer();
    record.state = "ended";
    persist(true);
  });
  listen("error", () => {
    finishBuffer();
    record.state = "error";
    record.errorCode = video.error?.code || 1;
    persist(true);
  });
  return {
    id,
    destroy() {
      finishBuffer();
      persist(true);
      disposed = true;
      for (const [name, callback] of listeners)
        video.removeEventListener(name, callback);
    },
  };
}
