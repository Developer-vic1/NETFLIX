import { el, button } from "../utils/dom.js";
import { t } from "../services/localization.service.js";
import {
  activeProfile,
  profilePreferences,
  saveProfilePreferences,
} from "../services/profile.service.js";
import { avatar } from "../components/profile-menu.js";
import { openNotifications } from "../components/notification-center.js";
import { toast } from "../components/toast.js";
export function renderAccount({ root, navigate, refresh }) {
  const profile = activeProfile(),
    preferences = profilePreferences(),
    watched = Object.keys(preferences.playerPreferences?.progress || {}).length;
  const panel = (key, content) =>
    el("section", { class: "panel" }, [el("h2", { text: t(key) }), ...content]);
  root.append(
    el("div", { class: "container page" }, [
      el("div", { class: "page-header" }, [
        el("div", {}, [
          el("h1", { class: "page-title", text: t("account.title") }),
          el("p", { class: "muted", text: t("account.subtitle") }),
        ]),
        button(
          t("profiles.switch"),
          () => navigate("profiles"),
          "button button-ghost",
        ),
      ]),
      el("section", { class: "panel account-profile" }, [
        avatar(profile, "avatar-large"),
        el("div", {}, [
          el("h2", { text: profile.name }),
          el("p", {
            class: "muted",
            text: t(
              profile.role === "admin" ? "profiles.admin" : "profiles.viewer",
            ),
          }),
        ]),
      ]),
      el("div", { class: "account-grid" }, [
        panel("profiles.activity", [
          el("p", {
            class: "account-value",
            text: t("profiles.stats", {
              list: preferences.myList?.length || 0,
              watched,
            }),
          }),
          button(t("nav.myList"), () => navigate("my-list")),
          button(
            t("profiles.clear"),
            () => {
              const playerPreferences = {
                ...preferences.playerPreferences,
                progress: {},
                positions: {},
              };
              if (saveProfilePreferences({ playerPreferences })) {
                refresh();
                toast(t("common.saved"), "success");
              }
            },
            "text-link",
          ),
        ]),
        panel("account.profiles", [
          el("p", { text: t("profiles.subtitle") }),
          button(t("profiles.manage"), () => navigate("profiles")),
        ]),
        panel("downloads.title", [
          el("p", { text: t("downloads.subtitle") }),
          button(t("downloads.manage"), () => navigate("downloads")),
        ]),
        panel("account.preferences", [
          el("p", { text: t("settings.subtitle") }),
          button(t("common.configure"), () => navigate("settings")),
        ]),
        panel("account.devices", [
          el("p", { text: t("account.deviceDemo") }),
          el("p", { class: "muted", text: t("downloads.device") }),
        ]),
        panel("nav.notifications", [
          button(t("nav.notifications"), openNotifications),
        ]),
        ...(profile.role === "admin"
          ? [
              panel("operations.title", [
                el("p", { text: t("admin.subtitle") }),
                button(
                  t("admin.open"),
                  () => navigate("operations"),
                  "button button-primary",
                ),
              ]),
            ]
          : []),
      ]),
    ]),
  );
}
