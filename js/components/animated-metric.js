import { el } from "../utils/dom.js";
import { motionReduced } from "../services/motion.service.js";

// The accessible value changes immediately. Only the visual interpolation animates.
export function metricAnimator() {
  const states = new Map();
  let disposed = false;
  function update(node, value, format) {
    const previous = states.get(node);
    if (previous?.value === value) return;
    if (previous?.frame) cancelAnimationFrame(previous.frame);
    const visual = el("span", { "aria-hidden": "true", text: format(value) });
    const accessible = el("span", { class: "sr-only", text: format(value) });
    node.replaceChildren(visual, accessible);
    node.dataset.measurement = Number.isFinite(value) ? String(value) : "";
    const state = { value, frame: null };
    states.set(node, state);
    if (
      disposed ||
      motionReduced() ||
      document.hidden ||
      !Number.isFinite(value) ||
      !Number.isFinite(previous?.value)
    )
      return;
    const start = performance.now();
    node.classList.remove("metric-updated");
    void node.offsetWidth;
    node.classList.add("metric-updated");
    node.dataset.animating = "true";
    const draw = (now) => {
      if (disposed || !node.isConnected) return;
      const progress = Math.min(1, (now - start) / 420);
      const eased = 1 - (1 - progress) ** 3;
      visual.textContent = format(
        previous.value + (value - previous.value) * eased,
      );
      if (progress < 1 && !motionReduced())
        state.frame = requestAnimationFrame(draw);
      else {
        visual.textContent = format(value);
        delete node.dataset.animating;
        state.frame = null;
      }
    };
    state.frame = requestAnimationFrame(draw);
  }
  return {
    update,
    destroy() {
      disposed = true;
      for (const [node, state] of states) {
        if (state.frame) cancelAnimationFrame(state.frame);
        delete node.dataset.animating;
      }
      states.clear();
    },
  };
}
