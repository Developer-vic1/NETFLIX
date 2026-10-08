import { el, button } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { openModal } from "./modal.js";
import { toast } from "./toast.js";
import { transfers } from "../services/transfer-tasks.service.js";
import { activeProfile } from "../services/profile.service.js";
import { eventBus } from "../services/event-bus.service.js";
import { transferText as tx, transferError, formatBytes, formatElapsed } from "../data/transfer-copy.js";
import { t } from "../services/localization.service.js";

const inProgress = (job) => ["queued", "active"].includes(job.status);
export const transferPercent = (job) => job.status === "ready" ? 100 : Math.min(99, Math.floor((job.loaded / (job.total || 1)) * 100));
export function transferCard(initial, { onPlay = () => {} } = {}) {
  const title = el("strong", { class: "transfer-name" });
  const phase = el("p", { class: "transfer-phase", role: "status", "aria-live": "polite" });
  const percent = el("strong", { class: "transfer-percent" });
  const filename = el("p", { class: "transfer-filename" });
  const bar = el("div", { class: "transfer-bar", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100 });
  const fill = el("span", { "aria-hidden": "true" }); bar.append(fill);
  const bytes = el("p", { class: "transfer-bytes" });
  const message = el("p", { class: "transfer-message" });
  const destinations = el("div", { class: "transfer-destinations" });
  const stats = el("dl", { class: "transfer-stats" });
  const statValues = ["speed", "elapsed", "remaining"].map((key) => {
    const value = el("dd"); stats.append(el("div", {}, [el("dt", { text: tx(key) }), value])); return value;
  });
  const actions = el("div", { class: "panel-actions transfer-actions" });
  const steps = el("ol", { class: "transfer-steps", "aria-label": tx("subtitle") }, ["validating", "uploading", "confirming", "saving"].map((key, index) => el("li", {}, [el("span", { class: "transfer-step-dot", text: index + 1, "aria-hidden": "true" }), tx(key)])));
  const root = el("article", { class: "transfer-card", "data-transfer-id": initial.id }, [
    el("div", { class: "transfer-heading" }, [el("div", {}, [title, phase]), percent]),
    filename, bar, bytes, stats, steps, message, destinations, actions,
  ]);
  let actionState;
  const update = (job) => {
    root.dataset.status = job.status; root.dataset.phase = job.phase;
    title.textContent = job.name;
    const phaseText = tx(job.phase);
    if (phase.textContent !== phaseText) phase.textContent = phaseText;
    const number = transferPercent(job);
    percent.textContent = `${number}%`;
    bar.setAttribute("aria-valuenow", number); bar.setAttribute("aria-label", job.name);
    bar.setAttribute("aria-valuetext", `${number}% · ${phaseText}`);
    fill.style.transform = `scaleX(${number / 100})`;
    filename.textContent = job.filename ? `${tx("file", { index: job.fileIndex, count: job.fileCount })} · ${job.filename}` : tx("file", { index: 0, count: job.fileCount });
    bytes.textContent = tx("bytes", { sent: formatBytes(job.loaded), total: formatBytes(job.total) });
    statValues[0].textContent = job.status === "active" && job.speed ? `${formatBytes(job.speed)}/s` : "—";
    statValues[1].textContent = formatElapsed(job.elapsed);
    statValues[2].textContent = job.phase === "uploading" && job.loaded > 0 && job.speed > 0 && job.loaded < job.total ? formatElapsed((job.total - job.loaded) / job.speed) : job.status === "ready" ? "00:00" : tx("estimating");
    const stepIndex = ({ validating: 0, uploading: 1, confirming: 2, saving: 3, ready: 4 })[job.phase] ?? -1;
    [...steps.children].forEach((step, index) => { step.dataset.state = index < stepIndex ? "done" : index === stepIndex ? "current" : "waiting"; });
    message.textContent = job.status === "error" ? transferError(job.error) : job.status === "cancelled" ? tx("cancelledHint") : job.status === "ready" ? tx("readyHint") : job.phase === "confirming" ? tx("receivedHint") : tx("keepOpen");
    const state = `${job.status}:${job.cancellable}:${job.phase === "cancelling"}`;
    if (actionState !== state) {
      actionState = state;
      destinations.replaceChildren(...(job.destinations || []).map((path) => el("code", { text: decodeURIComponent(path) })));
      actions.replaceChildren(...(inProgress(job) ? [button(tx("cancel"), () => transfers.cancel(job.id), "button button-ghost", { disabled: !job.cancellable || job.phase === "cancelling" })] : [
        ...(job.status === "ready" && job.catalogStatus === "published" ? [button(t("title.play"), () => { onPlay(); location.hash = `/player?title=${job.titleId}`; }, "button button-primary")] : []),
        ...(job.status === "error" || job.status === "cancelled" ? [button(tx("retry"), () => transfers.retry(job.id), "button button-primary")] : []),
        button(tx("dismiss"), () => transfers.dismiss(job.id), "button button-ghost"),
      ]));
    }
  };
  update(initial);
  return { root, update };
}

export function openTransferWindow(selectedId) {
  const body = el("div", { class: "transfer-window-body" });
  const cards = new Map();
  const summary = el("p", { class: "muted", text: tx("subtitle") });
  let dialog;
  const minimize = button(tx("background"), () => dialog.close(), "button button-ghost transfer-background");
  const draw = () => {
    const jobs = transfers.list().sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId));
    minimize.textContent = jobs.some(inProgress) ? tx("background") : t("common.close");
    if (!jobs.length) { body.replaceChildren(el("p", { text: tx("empty") })); cards.clear(); return; }
    for (const [id, card] of cards) if (!jobs.some((job) => job.id === id)) { card.root.remove(); cards.delete(id); }
    for (const job of jobs) {
      if (!cards.has(job.id)) { const card = transferCard(job, { onPlay: () => dialog.close() }); cards.set(job.id, card); body.append(card.root); }
      cards.get(job.id).update(job);
    }
  };
  draw();
  const stop = transfers.subscribe(draw);
  dialog = openModal({ title: tx("title"), content: [summary, body, minimize], onClose: stop });
  dialog.classList.add("transfer-window");
  return dialog;
}

export function mountTransferCenter() {
  const dock = el("aside", { class: "transfer-dock", hidden: true, "aria-label": tx("title") });
  const emblem = el("span", { class: "transfer-orbit", "aria-hidden": "true" }, icon("download"));
  const name = el("strong"), phase = el("span"), percent = el("span", { class: "transfer-dock-percent" });
  const progress = el("span", { class: "transfer-dock-fill", "aria-hidden": "true" });
  const control = button([emblem, el("span", { class: "transfer-dock-copy" }, [name, phase]), percent], () => openTransferWindow(currentId), "transfer-dock-button", { "aria-label": tx("view") });
  dock.append(control, progress); document.body.append(dock);
  let currentId;
  const draw = () => {
    const jobs = transfers.list(), active = jobs.filter(inProgress);
    const job = active.find((item) => item.status === "active") || active[0] || jobs.at(-1);
    dock.hidden = !job || activeProfile().role !== "admin";
    if (dock.hidden) return;
    currentId = job.id; dock.dataset.status = job.status;
    name.textContent = job.name; phase.textContent = `${tx(job.phase)}${active.length > 1 ? ` · ${active.length}` : ""}`;
    percent.textContent = `${transferPercent(job)}%`;
    progress.style.transform = `scaleX(${transferPercent(job) / 100})`;
  };
  const stopTasks = transfers.subscribe(draw);
  const stopEvents = eventBus.subscribe((event) => {
    if (event.name === "PROFILE_CHANGED") draw();
    if (["LIBRARY_UPLOAD_COMPLETED", "LIBRARY_UPLOAD_FAILED"].includes(event.name)) {
      const job = transfers.get(event.details);
      if (job?.profileId === activeProfile().id)
        toast(tx(event.name.endsWith("COMPLETED") ? "notificationDone" : "notificationFailed", { name: job.name }), event.name.endsWith("COMPLETED") ? "success" : "error");
    }
  });
  const beforeUnload = (event) => { if (transfers.hasActive()) { event.preventDefault(); event.returnValue = ""; } };
  window.addEventListener("beforeunload", beforeUnload);
  draw();
  return () => { stopTasks(); stopEvents(); window.removeEventListener("beforeunload", beforeUnload); dock.remove(); };
}
