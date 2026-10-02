import { el, button } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { t } from "../services/localization.service.js";
const focusableSelector =
  'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';
let activeDialog;
export function openModal({
  title,
  content,
  drawer = false,
  closeOnBackdrop = true,
  onClose,
}) {
  activeDialog?.close();
  const previousFocus = document.activeElement;
  const dialog = el("dialog", {
    class: `dialog${drawer ? " drawer" : ""}`,
    "aria-modal": "true",
    "aria-labelledby": "dialog-title",
  });
  const close = button(icon("close"), () => dialog.close(), "icon-button", {
    "aria-label": t("common.close"),
  });
  dialog.append(
    el("div", { class: "dialog-header" }, [
      el("h2", { id: "dialog-title", text: title }),
      close,
    ]),
    el("div", { class: "dialog-body" }, content),
  );
  dialog.addEventListener("click", (event) => {
    const rect = dialog.getBoundingClientRect();
    if (
      closeOnBackdrop &&
      event.target === dialog &&
      (event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom)
    )
      dialog.close();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const nodes = [...dialog.querySelectorAll(focusableSelector)].filter(
      (node) => node.getClientRects().length,
    );
    const first = nodes[0],
      last = nodes.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  dialog.addEventListener(
    "close",
    () => {
      dialog.remove();
      if (activeDialog === dialog) activeDialog = undefined;
      if (!activeDialog) document.body.classList.remove("dialog-open");
      if (!activeDialog && previousFocus?.isConnected) previousFocus.focus();
      onClose?.();
    },
    { once: true },
  );
  document.body.append(dialog);
  document.body.classList.add("dialog-open");
  activeDialog = dialog;
  dialog.showModal();
  close.focus();
  return dialog;
}
export function closeModal() {
  activeDialog?.close();
}
