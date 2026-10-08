import { el, button, field } from "../utils/dom.js";
import { isNativeSource } from "../services/media-upload.service.js";
import { transferText as tx, transferError } from "../data/transfer-copy.js";

export function localVideoPicker({ id, onSource, onBusy = () => {}, onError = () => {}, existingName = "" }) {
  let busy = false, disposed = false, controller;
  const path = el("input", { id: `${id}-path`, type: "text", placeholder: "C:\\…\\video.mp4", autocomplete: "off", spellcheck: false });
  const selected = el("p", { class: "muted library-file-names", text: existingName });
  const feedback = el("p", { class: "library-inline-feedback", role: "status", "aria-live": "polite" });
  const choose = button(tx("choose"), () => void load("/api/media/pick", {}), "button button-ghost");
  const use = button(tx("usePath"), () => void load("/api/media/source", { path: path.value.trim().replace(/^"(.*)"$/, "$1") }), "button button-ghost");
  const load = async (url, data) => {
    if (busy || disposed) return;
    busy = true; controller = new AbortController();
    onBusy(true); choose.disabled = use.disabled = path.disabled = true;
    feedback.dataset.loading = "true"; feedback.textContent = tx("choosing");
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), signal: controller.signal });
      const source = await response.json();
      if (!response.ok) throw new Error(source.error || "library.sourceUnavailable");
      if (disposed || source.cancelled) { feedback.textContent = ""; return; }
      if (!isNativeSource(source)) throw new Error("library.sourceUnavailable");
      feedback.textContent = "";
      await onSource(source);
      if (!disposed) selected.textContent = source.name;
    } catch (error) {
      if (!disposed && error.name !== "AbortError") { feedback.textContent = transferError(error.message); onError(error); }
    } finally {
      busy = false;
      if (!disposed) { feedback.dataset.loading = "false"; choose.disabled = use.disabled = path.disabled = false; onBusy(false); }
    }
  };
  path.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); use.click(); } });
  const root = el("div", { class: "library-source-picker" }, [
    choose, field(tx("path"), path), use, selected, feedback, el("p", { class: "muted", text: tx("sourceHint") }),
  ]);
  return { root, path, clear() { path.value = ""; selected.textContent = ""; feedback.textContent = ""; }, destroy() { disposed = true; controller?.abort(); } };
}
