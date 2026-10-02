import { eventBus } from "./event-bus.service.js";
import { getLocalization } from "./localization.service.js";
import {
  recordProbe,
  operationsSnapshot,
  upsertIncident,
} from "./operations-store.service.js";
const subscribers = new Set();
let playback = {
  title: "",
  state: "idle",
  currentTime: 0,
  duration: 0,
  width: 0,
  height: 0,
  totalFrames: 0,
  droppedFrames: 0,
  bufferingEvents: 0,
};
const probePoints = [];
const regions = new Map();
let sequence = 0;
let probe = {
  state: "idle",
  latency: null,
  bytes: null,
  status: null,
  measuredAt: null,
};
const publish = () => {
  for (const callback of subscribers) {
    try {
      callback();
    } catch {}
  }
};
function regionData(code) {
  if (!regions.has(code)) regions.set(code, { samples: [], playback: null });
  return regions.get(code);
}
export const telemetry = {
  updatePlayback(values) {
    playback = { ...playback, ...values, region: getLocalization().region };
    regionData(playback.region).playback = { ...playback };
    publish();
  },
  get snapshot() {
    const navigation = performance.getEntriesByType("navigation")[0];
    return {
      playback: { ...playback },
      probe: { ...probe },
      points: [...probePoints],
      navigationMs: navigation
        ? Math.round(navigation.responseEnd - navigation.startTime)
        : null,
      loadedResources: performance.getEntriesByType("resource").length,
      eventCount: eventBus.history.length,
      online: navigator.onLine,
      reportedDownlink:
        typeof navigator.connection?.downlink === "number"
          ? navigator.connection.downlink
          : null,
      regions: Object.fromEntries(
        [...regions].map(([code, value]) => [
          code,
          {
            samples: [...value.samples],
            playback: value.playback ? { ...value.playback } : null,
          },
        ]),
      ),
    };
  },
  subscribe(callback) {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
  },
  async measureCatalog(signal) {
    const start = performance.now(),
      code = getLocalization().region;
    probe = { ...probe, state: "loading" };
    publish();
    try {
      const response = await fetch(
        `assets/catalog-sources.json?probe=${Date.now()}`,
        { cache: "no-store", signal },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.arrayBuffer();
      const latency = Math.round((performance.now() - start) * 10) / 10;
      probe = {
        state: "ready",
        latency,
        bytes: body.byteLength,
        status: response.status,
        measuredAt: new Date().toLocaleTimeString(),
        sampleId: ++sequence,
      };
      probePoints.push(latency);
      if (probePoints.length > 60) probePoints.shift();
      const samples = regionData(code).samples;
      samples.push(latency);
      if (samples.length > 60) samples.shift();
      recordProbe({
        region: code,
        latency,
        bytes: body.byteLength,
        status: response.status,
        success: true,
      });
      const limit = operationsSnapshot().thresholds.responseMs;
      if (latency > limit)
        upsertIncident({
          fingerprint: `response:${Date.now()}`,
          kind: "response",
          severity: "warning",
          region: code,
          value: latency,
          threshold: limit,
        });
      eventBus.emit(
        "CATALOG_RESPONSE_MEASURED",
        `${response.status} · ${latency} ms · ${body.byteLength} bytes`,
      );
      publish();
    } catch (error) {
      if (error.name === "AbortError") {
        probe = { ...probe, state: "idle" };
        publish();
        return;
      }
      probe = { ...probe, state: "error", status: null };
      recordProbe({
        region: code,
        success: false,
        status: null,
        error: error.message,
      });
      upsertIncident({
        fingerprint: `network:${Date.now()}`,
        kind: "network",
        severity: "critical",
        region: code,
        value: null,
        threshold: null,
      });
      eventBus.emit("CATALOG_RESPONSE_FAILED", error.message);
      publish();
    }
  },
};
