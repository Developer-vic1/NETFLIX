import { el, button } from "../utils/dom.js";
import { t } from "../services/localization.service.js";
const timers = new Map();
export function toast(message, tone = "info") {
  const region = document.getElementById("toast-region");
  const remove = (node) => {
    clearTimeout(timers.get(node));
    timers.delete(node);
    node.remove();
  };
  if (region.children.length >= 3) remove(region.firstElementChild);
  const node = el(
    "div",
    {
      class: "toast",
      "data-tone": ["success", "warning", "error", "info"].includes(tone)
        ? tone
        : "info",
    },
    [
      el("span", { text: message }),
      button("×", () => remove(node), "icon-button", {
        "aria-label": t("common.close"),
      }),
    ],
  );
  region.append(node);
  timers.set(
    node,
    setTimeout(() => remove(node), 5500),
  );
}
export function clearToasts() {
  for (const [node, timer] of timers) {
    clearTimeout(timer);
    node.remove();
  }
  timers.clear();
}
