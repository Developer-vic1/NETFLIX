import { eventBus } from "./event-bus.service.js";
import { activeProfile } from "./profile.service.js";

const activeStates = new Set(["queued", "active"]);
const aborted = () => new DOMException("Transfer cancelled", "AbortError");

// One operation at a time avoids making large episodes compete for the same disk.
export function createTransferManager({ now = () => performance.now(), emit = () => {}, owner = () => activeProfile() } = {}) {
  const jobs = new Map(), listeners = new Set();
  let running, timer;
  const snapshot = (job) => ({
    id: job.id, name: job.name, kind: job.kind, profileId: job.profileId,
    status: job.status, phase: job.phase, loaded: job.loaded, total: job.total,
    fileCount: job.fileCount, fileIndex: job.fileIndex, filename: job.filename,
    elapsed: Math.max(0, ((job.finishedAt || now()) - (job.startedAt || job.createdAt)) / 1000),
    speed: job.speed, cancellable: job.cancellable, error: job.error,
    titleId: job.result?.id,
    catalogStatus: job.result?.status,
    destinations: job.result ? (job.result.kind === "series" ? job.result.episodes.map((episode) => episode.video.url) : [job.result.video?.url]).filter(Boolean) : [],
  });
  const announce = () => {
    for (const listener of listeners) { try { listener(); } catch { /* Keep the transfer alive. */ } }
    if ([...jobs.values()].some((job) => job.status === "active")) {
      if (!timer) timer = setInterval(announce, 1000);
    } else { clearInterval(timer); timer = undefined; }
  };
  const signalEvent = (job, suffix) => emit(`LIBRARY_UPLOAD_${suffix}`, job.id, { profileId: job.profileId });
  const prepare = (job) => {
    job.controller = new AbortController();
    job.promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
    job.promise.catch(() => {}); // Background tasks are also observed by their original form.
  };
  const pump = async () => {
    if (running) return;
    const job = [...jobs.values()].find((item) => item.status === "queued");
    if (!job) return;
    running = job.id;
    job.status = "active"; job.phase = "validating"; job.startedAt = now();
    announce(); signalEvent(job, "STARTED");
    const checkpoint = () => { if (job.controller.signal.aborted) throw aborted(); };
    try {
      job.result = await job.operation({
        signal: job.controller.signal,
        checkpoint,
        update(patch) {
          checkpoint();
          job.loaded = Math.min(job.total, Math.max(job.loaded, Number(patch.loaded) || 0));
          if (patch.phase) {
            job.phase = patch.phase;
            if (patch.phase === "confirming") job.cancellable = false;
            else if (patch.phase === "uploading") job.cancellable = true;
          }
          if (patch.filename !== undefined) job.filename = patch.filename;
          if (patch.fileIndex !== undefined) job.fileIndex = patch.fileIndex;
          const seconds = (now() - job.startedAt) / 1000;
          job.speed = seconds > 0.25 ? job.loaded / seconds : 0;
          announce();
        },
        commit() { checkpoint(); job.phase = "saving"; job.cancellable = false; announce(); },
      });
      job.status = "ready"; job.phase = "ready"; job.loaded = job.total;
      job.operation = undefined; job.resolve(job.result); signalEvent(job, "COMPLETED");
    } catch (error) {
      job.status = error.name === "AbortError" ? "cancelled" : "error";
      job.phase = job.status; job.error = error.message;
      job.reject(error); signalEvent(job, job.status === "cancelled" ? "CANCELLED" : "FAILED");
    } finally {
      job.finishedAt = now(); job.cancellable = false; running = undefined;
      // Bound retained file references, while preserving active and queued work.
      const completed = [...jobs.values()].filter((item) => !activeStates.has(item.status));
      for (const old of completed.slice(0, Math.max(0, completed.length - 8))) jobs.delete(old.id);
      announce(); queueMicrotask(pump);
    }
  };
  const canOwn = (job) => job && owner().id === job.profileId && owner().role === "admin";
  return {
    enqueue({ name, kind = "movie", profileId, total = 0, fileCount = 1 }, operation) {
      const job = { id: crypto.randomUUID(), name, kind, profileId, total, fileCount, operation,
        status: "queued", phase: "queued", loaded: 0, speed: 0, fileIndex: 0, filename: "", createdAt: now(), cancellable: true };
      prepare(job); jobs.set(job.id, job); announce(); queueMicrotask(pump);
      return { id: job.id, promise: job.promise };
    },
    get(id) { const job = jobs.get(id); return job ? snapshot(job) : undefined; },
    list(profileId = owner().id) { return [...jobs.values()].filter((job) => job.profileId === profileId).map(snapshot); },
    subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    cancel(id) {
      const job = jobs.get(id);
      if (!canOwn(job) || !activeStates.has(job.status) || !job.cancellable) return false;
      job.controller.abort();
      if (job.status === "queued") {
        job.status = "cancelled"; job.phase = "cancelled"; job.cancellable = false; job.finishedAt = now();
        job.reject(aborted()); signalEvent(job, "CANCELLED");
      } else job.phase = "cancelling";
      announce(); return true;
    },
    retry(id) {
      const job = jobs.get(id);
      if (!canOwn(job) || !["error", "cancelled"].includes(job.status) || !job.operation) return false;
      Object.assign(job, { status: "queued", phase: "queued", loaded: 0, speed: 0, fileIndex: 0, error: undefined, startedAt: undefined, finishedAt: undefined, cancellable: true });
      prepare(job); announce(); queueMicrotask(pump); return true;
    },
    dismiss(id) {
      const job = jobs.get(id);
      if (!canOwn(job) || activeStates.has(job.status)) return false;
      jobs.delete(id); announce(); return true;
    },
    hasActive() { return [...jobs.values()].some((job) => activeStates.has(job.status)); },
  };
}

export const transfers = createTransferManager({ emit: (...args) => eventBus.emit(...args) });
