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
  const draw = () => {
    const items = notifications().reverse();
    list.replaceChildren(
      ...(items.length
        ? items.map((item) => {
            const title = titles.find((title) => title.id === item.titleId);
            return el(
              "article",
              { class: `notification-item${item.read ? "" : " unread"}` },
              [
                el("strong", {
                  text: t(`notifications.${item.kind}`, {
                    title: title?.name || "",
                  }),
                }),
                el("p", {
                  class: "muted",
                  text: new Date(item.time).toLocaleTimeString(),
                }),
                el("a", {
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
