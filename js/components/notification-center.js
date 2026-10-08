import { el, button } from "../utils/dom.js";
import { t } from "../services/localization.service.js";
import { openDrawer } from "./drawer.js";
import { readPreferences } from "../services/storage.service.js";
import { profilePreferences } from "../services/profile.service.js";
import {
  notifications,
  markNotificationsRead,
  clearNotifications,
} from "../services/notification.service.js";
import { titles } from "../data/titles.js";
import { transfers } from "../services/transfer-tasks.service.js";
import { openTransferWindow } from "./transfer-center.js";
import { transferText as tx } from "../data/transfer-copy.js";
export const NOTIFICATION_CATEGORIES = Object.freeze([
  "content",
  "account",
  "security",
  "billing",
  "devices",
  "system",
]);
export function openNotifications() {
  const enabled =
    profilePreferences().playerPreferences?.notifications !== false;
  const list = el("div", { class: "stack" });
  const activeList = el("div", { class: "notification-transfers" });
  const activeCards = new Map();
  let notificationSignature = "";
  const draw = () => {
    const active = transfers.list().filter((job) => ["active", "queued"].includes(job.status));
    activeList.hidden = !active.length;
    for (const [id, card] of activeCards) if (!active.some((job) => job.id === id)) { card.node.remove(); activeCards.delete(id); }
    if (active.length && !activeList.querySelector("h3")) activeList.prepend(el("h3", { text: tx("active") }));
    for (const job of active) {
      if (!activeCards.has(job.id)) {
        const phase = el("span"), node = button([el("strong", { text: job.name }), phase], () => openTransferWindow(job.id), "button button-ghost notification-transfer-button");
        activeCards.set(job.id, { node, phase }); activeList.append(node);
      }
      activeCards.get(job.id).phase.textContent = `${tx(job.phase)} · ${Math.min(99, Math.floor(job.loaded / (job.total || 1) * 100))}%`;
    }
    const items = notifications().reverse();
    const signature = JSON.stringify(items);
    if (signature === notificationSignature) return;
    notificationSignature = signature;
    list.replaceChildren(
      ...(items.length
        ? items.map((item) => {
            const title = titles.find((title) => title.id === item.titleId);
            const upload = ["uploadDone", "uploadFailed", "uploadCancelled"].includes(item.kind);
            return el(
              "article",
              { class: `notification-item${item.read ? "" : " unread"}` },
              [
                el("strong", {
                  text: upload ? tx(({ uploadDone: "notificationDone", uploadFailed: "notificationFailed", uploadCancelled: "notificationCancelled" })[item.kind], { name: item.label || title?.name || "" }) : t(`notifications.${item.kind}`, {
                    title: title?.name || "",
                  }),
                }),
                el("p", {
                  class: "muted",
                  text: new Date(item.time).toLocaleTimeString(),
                }),
                upload ? button(transfers.get(item.taskId) ? tx("view") : t("library.title"), () => {
                  if (transfers.get(item.taskId)) openTransferWindow(item.taskId);
                  else { dialog.close(); location.hash = "/operations?tab=library"; }
                }, "text-link") : el("a", {
                  href:
                    item.kind === "download" || item.kind === "failed"
                      ? "#/downloads"
                      : `#/player?title=${item.titleId}`,
                  class: "text-link",
                  text: t(
                    item.kind === "download" || item.kind === "failed"
                      ? "downloads.manage"
                      : "title.play",
                  ),
                  onclick: () => dialog.close(),
                }),
              ],
            );
          })
        : [el("p", { class: "muted", text: t("notifications.none") })]),
    );
  };
  draw();
  const dialog = openDrawer({
    title: t("nav.notifications"),
    content: enabled
      ? [
          el("div", { class: "panel-actions" }, [
            button(t("notifications.read"), () => {
              markNotificationsRead();
              draw();
            }),
            button(
              t("notifications.clear"),
              () => {
                clearNotifications();
                draw();
              },
              "text-link",
            ),
          ]),
          activeList,
          list,
        ]
      : el("p", { text: t("notification.empty") }),
  });
  const update = () => draw();
  window.addEventListener("notifications-changed", update);
  dialog.addEventListener(
    "close",
    () => window.removeEventListener("notifications-changed", update),
    { once: true },
  );
  return dialog;
}
