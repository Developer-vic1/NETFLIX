import { APP_CONFIG } from "../config/app-config.js";
import { SERVICE_NAMES, SERVICE_STATES } from "../data/metrics.js";
export function appendMetric(points, point) {
  if (!Number.isFinite(point))
    throw new TypeError("Metric point must be finite");
  return [...points.filter(Number.isFinite), point].slice(
    -APP_CONFIG.maxMetricPoints,
  );
}
export function createMonitoringFixture() {
  const services = new Map(SERVICE_NAMES.map((name) => [name, "ONLINE"]));
  return {
    get services() {
      return [...services].map(([name, status]) => ({ name, status }));
    },
    advance(name) {
      if (!services.has(name)) throw new RangeError("Unknown service");
      const status =
        SERVICE_STATES[
          (SERVICE_STATES.indexOf(services.get(name)) + 1) %
            SERVICE_STATES.length
        ];
      services.set(name, status);
      return status;
    },
  };
}
