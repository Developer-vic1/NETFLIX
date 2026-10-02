export const SERVICE_NAMES = Object.freeze([
  "API Gateway",
  "Authentication",
  "Profile",
  "Catalog",
  "Recommendation",
  "Streaming",
  "Billing",
  "CRM",
  "Monitoring",
  "Analytics",
]);
export const SERVICE_STATES = Object.freeze([
  "ONLINE",
  "DEGRADED",
  "OFFLINE",
  "RECOVERING",
]);
export const SCALE_STATES = Object.freeze([
  "NORMAL",
  "PRESSURE",
  "SCALING",
  "STABILIZED",
]);
// Deterministic UI fixture, not measured telemetry or an academic model.
export const metricFixture = Object.freeze({
  latency: [32, 34, 30, 39, 35, 42, 36, 33, 37, 31, 34, 32],
  streams: 1200,
  instances: 8,
  cpu: 42,
});
export const mapFixture = Object.freeze({
  BO: { latency: 32, streams: 120, instances: 2 },
  US: { latency: 40, streams: 600, instances: 4 },
  BR: { latency: 45, streams: 240, instances: 2 },
});
