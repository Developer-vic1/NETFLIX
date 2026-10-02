import { THEME } from "../config/theme.js";
import { el, field, select } from "../utils/dom.js";
import { REGIONS, getAvailability, regionName } from "../config/regions.js";
import { getLocalization, t } from "../services/localization.service.js";
import { telemetry } from "../services/session-telemetry.service.js";
import {
  operationsSnapshot,
  subscribeOperations,
} from "../services/operations-store.service.js";
export function regionalMap(parent) {
  const colors = THEME.colors;
  const mapNode = el("div", {
    id: "world-map",
    class: "map-frame",
    "aria-hidden": "true",
  });
  const regionSelect = select(
    REGIONS.map((item) => [
      item.code,
      regionName(item.code, getLocalization().language),
    ]),
    getLocalization().region,
    { id: "map-region" },
  );
  const summary = el("p", { class: "map-summary", role: "status" });
  const description = (code) => {
    const history = operationsSnapshot(),
      samples = history.probes.filter(
        (item) => item.region === code && item.success,
      ),
      sessions = history.sessions.filter(
        (item) => item.region === code && item.playedSeconds > 0,
      );
    return `${regionName(code, getLocalization().language)} · ${samples.length || sessions.length ? `${t("admin.samples")}: ${samples.length} · ${t("operations.latency")}: ${samples.length ? `${samples.at(-1).latency} ms` : "—"} · ${t("admin.buffering")}: ${sessions.reduce((sum, item) => sum + item.bufferingEvents, 0)}` : t("admin.noRegion")}`;
  };
  const update = () => {
    summary.textContent = description(regionSelect.value);
  };
  regionSelect.addEventListener("change", update);
  update();
  parent.append(
    mapNode,
    field(t("settings.region"), regionSelect, t("operations.mapKeyboard")),
    summary,
  );
  let map;
  try {
    if (!window.jsVectorMap) throw new Error("Missing local map library");
    map = new window.jsVectorMap({
      selector: "#world-map",
      map: "world",
      backgroundColor: colors.panel,
      zoomButtons: false,
      zoomOnScroll: false,
      draggable: false,
      regionStyle: {
        initial: {
          fill: colors.surface,
          stroke: colors.border,
          strokeWidth: 0.5,
        },
        hover: { fill: colors.primary },
        selected: { fill: colors.primary },
      },
      selectedRegions: [
        ...new Set([
          ...operationsSnapshot().probes.map((item) => item.region),
          ...operationsSnapshot().sessions.map((item) => item.region),
        ]),
      ],
      onRegionTooltipShow(event, tooltip, code) {
        tooltip.text(description(code));
      },
      onRegionClick(event, code) {
        if (REGIONS.some((item) => item.code === code)) {
          regionSelect.value = code;
          update();
        }
      },
    });
  } catch (error) {
    console.error("Regional map initialization failed", error);
    mapNode.replaceChildren(
      el("p", { role: "alert", text: t("common.error") }),
    );
  }
  const clampTooltip = () => {
    const tooltip = document.querySelector(".jvm-tooltip.active");
    if (!tooltip) return;
    const rect = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(innerWidth - rect.width - 8, rect.left)) + scrollX}px`;
    tooltip.style.top = `${Math.max(8, Math.min(innerHeight - rect.height - 8, rect.top)) + scrollY}px`;
  };
  mapNode.addEventListener("mousemove", clampTooltip);
  const observer = new ResizeObserver(() => {
    if (mapNode.offsetWidth > 0 && mapNode.offsetHeight > 0) map?.updateSize();
  });
  observer.observe(mapNode);
  const unsubscribe = subscribeOperations(() => {
    update();
    map?.clearSelectedRegions();
    map?.setSelectedRegions([
      ...new Set([
        ...operationsSnapshot().probes.map((item) => item.region),
        ...operationsSnapshot().sessions.map((item) => item.region),
      ]),
    ]);
  });
  return () => {
    unsubscribe();
    observer.disconnect();
    mapNode.removeEventListener("mousemove", clampTooltip);
    map?.destroy();
  };
}
