const APP_CACHE = "netflix-app-v2",
  MEDIA_CACHE = "netflix-media-v1";
let localServerUnavailable = false;
// Read only one chunk at a time. Never materialize a multi-GB movie with blob().
function cachedMediaRange(cached, range, signal) {
  if (!range) return cached;
  const size = Number(cached.headers.get("Content-Length"));
  // Older downloads without a size remain streamable as a normal 200 response.
  if (!Number.isSafeInteger(size) || size <= 0) return cached;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  const first = match?.[1] ? Number(match[1]) : null;
  const last = match?.[2] ? Number(match[2]) : null;
  const start = first ?? Math.max(0, size - (last ?? 0));
  const end = first !== null && last !== null ? Math.min(last, size - 1) : size - 1;
  if (!match || (!match[1] && !match[2]) ||
      !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      (first === null && last === 0) || start > end || start >= size) {
    void cached.body?.cancel().catch(() => {});
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  if (!cached.body) return cached;
  const reader = cached.body.getReader();
  let offset = 0, stopped = false;
  const stop = async (reason) => {
    if (stopped) return;
    stopped = true;
    signal?.removeEventListener("abort", abort);
    await reader.cancel(reason).catch(() => {});
  };
  let output;
  const abort = () => {
    void stop(signal.reason);
    output?.error(signal.reason || new DOMException("Cancelled", "AbortError"));
  };
  const body = new ReadableStream({
    start(controller) {
      output = controller;
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
    },
    async pull(controller) {
      try {
        while (!stopped) {
          const { done, value } = await reader.read();
          if (stopped) return;
          if (done) throw new Error("Incomplete cached media");
          const chunkStart = offset;
          offset += value.byteLength;
          if (offset <= start) continue;
          // Copy only the requested bytes so a tiny range cannot retain a large chunk.
          controller.enqueue(value.slice(Math.max(0, start - chunkStart), Math.min(value.byteLength, end + 1 - chunkStart)));
          if (offset > end) {
            controller.close();
            await stop();
          }
          return;
        }
      } catch (error) {
        if (!stopped) controller.error(error);
        await stop(error);
      }
    },
    cancel: stop,
  }, { highWaterMark: 0 });
  return new Response(body, {
    status: 206,
    headers: {
      "Content-Type": cached.headers.get("Content-Type") || "video/mp4",
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
    },
  });
}
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const response = await fetch("/assets/offline-manifest.json", {
        cache: "no-store",
      });
      const assets = await response.json();
      const cache = await caches.open(APP_CACHE);
      // Bound concurrency so offline preparation cannot flood the local server.
      let next = 0;
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          while (next < assets.length) await cache.add(assets[next++]);
        }),
      );
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil((async () => {
    // Retire previous app bundles only; downloaded movies are preserved.
    for (const key of await caches.keys())
      if (key.startsWith("netflix-app-") && key !== APP_CACHE) await caches.delete(key);
    await self.clients.claim();
  })()),
);
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // Native source previews and live import status must never enter the app cache.
  if (url.pathname.startsWith("/api/")) return;
  if (/\.(?:mp4|mkv)$/i.test(url.pathname)) {
    // Let the browser's native media loader control buffering and cancellation.
    // Wrapping local playback in fetch/respondWith adds an unnecessary stream relay.
    if (url.origin === self.location.origin && self.navigator.onLine && !localServerUnavailable) return;
    event.respondWith(
      (async () => {
        // The local server seeks directly on disk; bypass cache while it is available.
        if (url.origin === self.location.origin) {
          try {
            const response = await fetch(event.request);
            if (response.ok || response.status === 416) return response;
            await response.body?.cancel();
          } catch (error) {
            if (event.request.signal.aborted) throw error;
          }
        }
        const cache = await caches.open(MEDIA_CACHE),
          cached = await cache.match(url.href);
        if (!cached) return fetch(event.request);
        return cachedMediaRange(cached, event.request.headers.get("range"), event.request.signal);
      })(),
    );
    return;
  }
  if (url.origin !== self.location.origin || url.searchParams.has("probe"))
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(APP_CACHE);
      try {
        const response = await fetch(event.request);
        localServerUnavailable = false;
        if (response.ok && !url.pathname.endsWith("offline-manifest.json"))
          event.waitUntil(
            cache.put(event.request, response.clone()).catch(() => {}),
          );
        return response;
      } catch {
        localServerUnavailable = true;
        return (
          (await cache.match(event.request, { ignoreSearch: true })) ||
          (event.request.mode === "navigate"
            ? await cache.match("/index.html")
            : null) ||
          new Response("", { status: 503 })
        );
      }
    })(),
  );
});
