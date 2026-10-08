import { el, button } from "../utils/dom.js";
import { t } from "../services/localization.service.js";
import {
  activeProfile,
  getProfiles,
  switchProfile,
} from "../services/profile.service.js";
import { openModal, closeModal } from "./modal.js";
import { toast } from "./toast.js";
export function avatar(profile, extra = "") {
  return el(
    "span",
    { class: `avatar avatar-${profile.color} ${extra}`, "aria-hidden": "true" },
    [
      el("span", { class: "avatar-eyes" }),
      el("span", { class: "avatar-smile" }),
    ],
  );
}
export function profileMenu(onChange) {
  const current = activeProfile();
  return button(
    [avatar(current), el("span", { class: "profile-chevron", text: "⌄" })],
    () =>
      openModal({
        title: t("profiles.choose"),
        content: [
          el(
            "div",
            { class: "profile-options" },
            getProfiles().map((profile) =>
              button(
                [
                  avatar(profile),
                  el("span", { text: profile.name }),
                  profile.role === "admin"
                    ? el("small", { class: "muted", text: t("profiles.admin") })
                    : null,
                ],
                () => {
                  try {
                    switchProfile(profile.id);
                    closeModal();
                    onChange(profile);
                  } catch {
                    toast(t("common.storageError"), "error");
                  }
                },
                "profile-option",
                { "aria-pressed": String(profile.id === current.id) },
              ),
            ),
          ),
          el("a", {
            href: "#/profiles",
            class: "button",
            text: t("profiles.manage"),
            onclick: closeModal,
          }),
          el("a", {
            href: "#/connections",
            class: "button button-ghost",
            text: t("connection.title"),
            onclick: closeModal,
          }),
          el("a", {
            href: "#/account",
            class: "text-link",
            text: t("account.title"),
            onclick: closeModal,
          }),
        ],
      }),
    "profile-trigger",
    {
      "aria-label": `${t("profiles.switch")} · ${current.name}`,
      "aria-haspopup": "dialog",
    },
  );
}
