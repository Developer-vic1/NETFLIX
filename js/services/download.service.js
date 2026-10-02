import { titles } from "../data/titles.js";
import { eventBus } from "./event-bus.service.js";
import { activeProfile } from "./profile.service.js";
export const MEDIA_CACHE = "netflix-media-v1";
const jobs = new Map(),
  listeners = new Set();
const publish = () => {
  for (const callback of listeners) {
    try {
      callback();
    } catch {}
  }
};
export function mediaSource(title, quality) {
  if (title.localAsset) return title.localAsset;
  const offline =
    title.qualities.find((item) => item.quality === "360p") ||
    title.qualities[0];
  const file =
    title.id === "sintel"
      ? "sintel-full-360p.mp4"
      : `${title.id}-${offline.quality}.mp4`;
  return quality === offline.quality
    ? `assets/videos/${file}`
    : title.qualities.find((item) => item.quality === quality)?.url;
}
export function offlineSource(title) {
  const quality =
    title.qualities.find((item) => item.quality === "360p") ||
    title.qualities[0];
  return {
    ...quality,
    url: new URL(mediaSource(title, quality.quality), location.href).href,
  };
}
export function downloadState(id) {
  return jobs.get(id) || { state: "idle", percent: 0 };
}
export function subscribeDownloads(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
export async function downloadedTitles() {
  if (!("caches" in window)) return [];
  const cache = await caches.open(MEDIA_CACHE),
    keys = new Set((await cache.keys()).map((request) => request.url));
  return titles.filter((title) => keys.has(offlineSource(title).url));
}
export async function downloadTitle(title) {
  if (jobs.get(title.id)?.state === "downloading") return;
  if (!("serviceWorker" in navigator) || !("caches" in window))
    throw new Error("downloads.unsupported");
  const source = offlineSource(title),
    controller = new AbortController(),
    profileId = activeProfile().id;
  const update = (values) => {
    jobs.set(title.id, { ...jobs.get(title.id), ...values });
    publish();
  };
  update({ state: "downloading", percent: 0, controller });
  try {
    let setupTimer;
    try {
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((resolve, reject) => {
          setupTimer = setTimeout(
            () => reject(new Error("downloads.unsupported")),
            15000,
          );
        }),
      ]);
    } finally {
      clearTimeout(setupTimer);
    }
    controller.signal.throwIfAborted();
    const quota = await navigator.storage?.estimate?.();
    if (quota && quota.quota - quota.usage < source.bytes * 1.1)
      throw new Error("downloads.space");
    const response = await fetch(source.url, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok || response.type === "opaque" || !response.body)
      throw new Error("downloads.error");
    const total =
      Number(response.headers.get("content-length")) || source.bytes;
    let received = 0,
      lastPercent = -1;
    const reader = response.body.getReader();
    const tracked = new ReadableStream({
      async pull(streamController) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            streamController.close();
            return;
          }
          received += value.byteLength;
          const percent = Math.min(99, Math.floor((received / total) * 100));
          if (percent !== lastPercent) {
            lastPercent = percent;
            update({ percent, bytes: received });
          }
          streamController.enqueue(value);
        } catch (error) {
          streamController.error(error);
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    });
    const cache = await caches.open(MEDIA_CACHE);
    await cache.put(
      source.url,
      new Response(tracked, {
        status: 200,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(total),
        },
      }),
    );
    update({ state: "ready", percent: 100, bytes: received, controller: null });
    eventBus.emit("DOWNLOAD_COMPLETED", `${title.id} · ${received} bytes`, {
      profileId,
    });
  } catch (error) {
    update({
      state: error.name === "AbortError" ? "idle" : "error",
      error: ["downloads.space", "downloads.error"].includes(error.message)
        ? error.message
        : "downloads.error",
      controller: null,
    });
    if (error.name !== "AbortError")
      eventBus.emit("DOWNLOAD_FAILED", title.id, { profileId });
  }
}
export function cancelDownload(id) {
  jobs.get(id)?.controller?.abort();
}
export async function removeDownload(title) {
  const cache = await caches.open(MEDIA_CACHE);
  await cache.delete(offlineSource(title).url);
  jobs.set(title.id, { state: "idle", percent: 0 });
  publish();
  eventBus.emit("DOWNLOAD_REMOVED", title.id);
}
