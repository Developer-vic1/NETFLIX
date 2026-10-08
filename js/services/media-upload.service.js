export const MAX_VIDEO_BYTES = 15 * 1024 ** 3;
export const isStoredVideo = (video) => Boolean(video && typeof video.url === "string" && /^(?:assets\/videos\/library\/[a-f0-9]{32}|videos\/[a-z0-9_-]+|series\/[a-z0-9_-]+_%23[0-9]+|series\/[a-z0-9_-]+_T[0-9]+_%23[0-9]+)\.(?:mp4|mkv)$/.test(video.url));
export const isNativeSource = (video) => Boolean(video && /^[a-f0-9]{32}$/.test(video.sourceToken || "") && video.url === `/api/media/source/${video.sourceToken}`);
const copies = new WeakMap(), uploadIds = new WeakMap();
const cancelled = () => new DOMException("Transfer cancelled", "AbortError");
function destinationPath({ title, kind, season, number, extension = "mp4" }) {
  if (!title) return undefined;
  let slug = title.normalize("NFKD").replace(/[^\x00-\x7F]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100).replace(/-$/, "");
  if (!slug) return undefined;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(slug)) slug = `titulo-${slug}`;
  return kind === "series" ? `series/${slug}${season > 1 ? `_T${season}` : ""}_%23${number}.${extension}` : `videos/${slug}.${extension}`;
}
async function relocateStored(video, options) {
  if (!options.title || destinationPath({ ...options, extension: video.url.split(".").pop() }) === video.url) return video;
  const response = await fetch("/api/media/source", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: video.url }), signal: options.signal });
  const source = await response.json();
  if (!response.ok) throw new Error(source.error || "library.sourceUnavailable");
  return uploadVideo(source, options);
}

// Send the File directly: never read a multi-gigabyte video into a JS array buffer.
export async function uploadVideo(video, { signal, onProgress = () => {}, title, kind, season, number } = {}) {
  const options = { signal, onProgress, title, kind, season, number };
  if (signal?.aborted) throw cancelled();
  if (copies.has(video)) {
    onProgress({ loaded: video.size, phase: "uploading" });
    const saved = await relocateStored(copies.get(video), options);
    copies.set(video, saved); return saved;
  }
  if (isStoredVideo(video)) {
    const saved = await relocateStored(video, options);
    copies.set(video, saved); return saved;
  }
  if (video.size > MAX_VIDEO_BYTES) throw new Error("library.videoTooLarge");
  if (isNativeSource(video)) {
    const response = await fetch("/api/imports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceToken: video.sourceToken, title, kind, season, number }) });
    const started = await response.json();
    if (!response.ok) throw new Error(started.error || "library.moveError");
    let cancelSent = false;
    while (true) {
      if (signal?.aborted && !cancelSent) {
        cancelSent = true;
        await fetch(`/api/imports/${started.id}`, { method: "DELETE" });
      }
      const statusResponse = await fetch(`/api/imports/${started.id}`, { cache: "no-store" });
      if (!statusResponse.ok) throw new Error("library.moveError");
      const status = await statusResponse.json();
      if (!signal?.aborted) onProgress({ loaded: status.loaded, phase: status.phase === "confirming" ? "confirming" : "uploading" });
      if (status.status === "ready") {
        if (!isStoredVideo(status.result) || status.result.size !== video.size) throw new Error("library.moveError");
        copies.set(video, status.result);
        if (signal?.aborted) throw cancelled();
        return status.result;
      }
      if (status.status === "cancelled") throw cancelled();
      if (status.status === "error") throw new Error(status.error || "library.moveError");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  let uploadId = uploadIds.get(video);
  if (uploadId) {
    // The server may have saved the file even if its final response was lost.
    const url = `assets/videos/library/${uploadId}.${/\.mkv$/i.test(video.name) ? "mkv" : "mp4"}`;
    try {
      const head = await fetch(url, { method: "HEAD", signal, cache: "no-store" });
      if (head.ok && Number(head.headers.get("Content-Length")) === video.size) {
        const saved = { url, name: video.name, size: video.size };
        copies.set(video, saved); onProgress({ loaded: video.size, phase: "uploading" });
        const organized = await relocateStored(saved, options);
        copies.set(video, organized); return organized;
      }
    } catch (error) { if (error.name === "AbortError") throw error; }
  } else { uploadId = crypto.randomUUID().replaceAll("-", ""); uploadIds.set(video, uploadId); }
  const result = await new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true; signal?.removeEventListener("abort", abort);
      error ? reject(error) : resolve(value);
    };
    const abort = () => { request.abort(); finish(cancelled()); };
    request.upload.addEventListener("progress", (event) => {
      if (!settled) onProgress({ loaded: Math.min(video.size, event.loaded), phase: "uploading" });
    });
    request.upload.addEventListener("load", () => {
      if (!settled) onProgress({ loaded: video.size, phase: "confirming" });
    });
    request.addEventListener("load", () => {
      if (request.status < 200 || request.status >= 300) {
        finish(new Error(request.status === 413 ? "library.videoTooLarge" : request.status === 507 ? "library.spaceError" : request.status === 415 ? "library.mp4Invalid" : "library.uploadError"));
        return;
      }
      try {
        const saved = JSON.parse(request.responseText);
        if (!isStoredVideo(saved) || saved.size !== video.size) throw new Error("library.uploadError");
        finish(null, { ...saved, name: video.name });
      } catch { finish(new Error("library.uploadError")); }
    });
    request.addEventListener("error", () => finish(new Error("library.serverUnavailable")));
    request.addEventListener("abort", () => finish(cancelled()));
    request.open("POST", "/api/media");
    request.setRequestHeader("Content-Type", /\.mkv$/i.test(video.name) ? "video/x-matroska" : "video/mp4");
    request.setRequestHeader("X-Media-Name", encodeURIComponent(video.name));
    request.setRequestHeader("X-Upload-Id", uploadId);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort(); else request.send(video);
  });
  const organized = await relocateStored(result, options);
  copies.set(video, organized);
  return organized;
}
