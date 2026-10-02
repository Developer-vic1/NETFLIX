import test from "node:test";
import assert from "node:assert/strict";
import { createEventBus } from "../js/services/event-bus.service.js";
import {
  appendMetric,
  createMonitoringFixture,
} from "../js/services/monitoring.service.js";
import { networkPreview } from "../js/services/streaming.service.js";
import {
  getAvailability,
  REGIONS,
  REGION_GROUPS,
} from "../js/config/regions.js";
import { LANGUAGES } from "../js/config/languages.js";
import { getRecommendations } from "../js/services/recommendation.service.js";
import { getBillingSummary } from "../js/services/billing.service.js";
test("event history stays bounded, isolates subscribers, and unsubscribes", () => {
  const bus = createEventBus();
  let deliveries = 0;
  bus.subscribe(() => {
    throw new Error("subscriber fixture");
  });
  const unsubscribe = bus.subscribe(() => deliveries++);
  for (let i = 0; i < 150; i++) bus.emit(`EVENT_${i}`, i);
  assert.equal(bus.history.length, 100);
  assert.equal(bus.history[0].name, "EVENT_50");
  assert.equal(deliveries, 150);
  unsubscribe();
  bus.emit("LAST");
  assert.equal(deliveries, 150);
  const copy = bus.history;
  copy.length = 0;
  assert.equal(bus.history.length, 100);
  assert.equal(createEventBus(-1).emit("ONE").name, "ONE");
});
test("chart datasets stay bounded and reject nonfinite samples", () => {
  let points = [];
  for (let i = 0; i < 200; i++) points = appendMetric(points, i);
  assert.equal(points.length, 60);
  assert.equal(points[0], 140);
  assert.throws(() => appendMetric(points, NaN), TypeError);
  assert.throws(() => appendMetric(points, Infinity), TypeError);
});
test("region never blocks a supported interface language", () => {
  assert.equal(getAvailability("US", "es"), "SUPPORTED");
  assert.equal(getAvailability("BO", "ar"), "SUPPORTED");
  assert.equal(getAvailability("CN", "it"), "SUPPORTED");
  assert.equal(getAvailability("BR", "pt"), "PARTIAL");
  assert.equal(getAvailability("invalid", "es"), "UNAVAILABLE");
  assert.deepEqual(
    new Set(REGIONS.map((item) => item.group)),
    new Set(REGION_GROUPS),
  );
  assert.equal(LANGUAGES.find((item) => item.code === "ar").direction, "rtl");
  assert.equal(LANGUAGES.filter((item) => item.direction === "rtl").length, 1);
});
test("service failure fixtures recover without cross-service mutation", () => {
  const fixture = createMonitoringFixture();
  assert.deepEqual(
    Array.from({ length: 4 }, () => fixture.advance("API Gateway")),
    ["DEGRADED", "OFFLINE", "RECOVERING", "ONLINE"],
  );
  assert.equal(
    fixture.services.find((item) => item.name === "Billing").status,
    "ONLINE",
  );
  assert.throws(() => fixture.advance("unknown"), RangeError);
});
test("network preview validates limits and identifies simulation without inferred quality", () => {
  assert.deepEqual(networkPreview(0, "4K"), {
    simulated: true,
    mbps: 0,
    requestedQuality: "4K",
    state: "offline",
  });
  assert.equal(networkPreview(100, "Auto").requestedQuality, "Auto");
  for (const value of [-1, 101, "bad", Infinity, null, false, [], ""])
    assert.throws(() => networkPreview(value, "Auto"), RangeError);
  assert.throws(() => networkPreview(10, "8K"), RangeError);
});
test("academic services remain empty contracts", () => {
  assert.deepEqual(getRecommendations().items, []);
  assert.equal(getRecommendations().reason, "NOT_IMPLEMENTED");
  assert.deepEqual(getBillingSummary().paymentMethods, []);
  assert.equal(getBillingSummary().demo, true);
});
