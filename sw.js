const APP_CACHE = "netflix-app-v1",
  MEDIA_CACHE = "netflix-media-v1";
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
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // Native source previews and live import status must never enter the app cache.
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.endsWith(".mp4")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(MEDIA_CACHE),
          cached = await cache.match(url.href);
        if (!cached) return fetch(event.request);
        const range = event.request.headers.get("range");
        if (!range) return cached;
        const blob = await cached.blob(),
          match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match || (!match[1] && !match[2]))
          return new Response(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${blob.size}` },
          });
        const start = match[1]
          ? Number(match[1])
          : Math.max(0, blob.size - Number(match[2]));
        const end =
          match[1] && match[2]
            ? Math.min(Number(match[2]), blob.size - 1)
            : blob.size - 1;
        if (start > end || start >= blob.size)
          return new Response(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${blob.size}` },
          });
        return new Response(blob.slice(start, end + 1, "video/mp4"), {
          status: 206,
          headers: {
            "Content-Type": "video/mp4",
            "Accept-Ranges": "bytes",
            "Content-Range": `bytes ${start}-${end}/${blob.size}`,
            "Content-Length": String(end - start + 1),
          },
        });
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
        if (response.ok && !url.pathname.endsWith("offline-manifest.json"))
          event.waitUntil(
            cache.put(event.request, response.clone()).catch(() => {}),
          );
        return response;
      } catch {
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
