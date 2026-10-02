import { titles } from "../data/titles.js";
import { offlineSource, downloadedTitles } from "./download.service.js";
import { eventBus } from "./event-bus.service.js";
import { t } from "./localization.service.js";
export async function checkLocalServices(signal, onResult = () => {}) {
  const result = [];
  const inspect = async (id, check) => {
    const start = performance.now();
    try {
      const detail = await check();
      const row = {
        id,
        ok: true,
        detail,
        ms: performance.now() - start,
        time: new Date().toISOString(),
      };
      result.push(row);
      onResult(row);
    } catch (error) {
      if (signal?.aborted) throw error;
      const row = {
        id,
        ok: false,
        detail: error.message,
        ms: performance.now() - start,
        time: new Date().toISOString(),
      };
      result.push(row);
      onResult(row);
    }
  };
  await Promise.all([
    inspect("catalog", async () => {
      const response = await fetch(
        `assets/catalog-sources.json?probe=${Date.now()}`,
        { signal, cache: "no-store" },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const catalog = await response.json();
      if (!Array.isArray(catalog) || !catalog.length)
        throw new Error(t("ops.health.empty"));
      return t("ops.health.catalog", {
        count: catalog.length,
        status: response.status,
      });
    }),
    inspect("storage", async () => {
      const key = "nsip.health-check";
      try {
        localStorage.setItem(key, "verified");
        if (localStorage.getItem(key) !== "verified")
          throw new Error(t("ops.health.blocked"));
        return t("ops.health.storage");
      } finally {
        localStorage.removeItem(key);
      }
    }),
    inspect("offline", async () => {
      if (!navigator.serviceWorker?.controller)
        throw new Error(t("ops.health.inactive"));
      const saved = await downloadedTitles();
      return t("ops.health.offline", { count: saved.length });
    }),
    inspect("media", async () => {
      const source = offlineSource(titles[0]);
      const response = await fetch(`${source.url}?probe=${Date.now()}`, {
        signal,
        headers: { Range: "bytes=0-1023" },
        cache: "no-store",
      });
      const bytes = await response.arrayBuffer();
      if (response.status !== 206 || bytes.byteLength !== 1024)
        throw new Error(`Range request: ${response.status}`);
      return `HTTP 206 · ${bytes.byteLength} bytes`;
    }),
  ]);
  eventBus.emit(
    "SERVICE_HEALTH_CHECKED",
    `${result.filter((item) => item.ok).length}/${result.length}`,
  );
  return result;
}
