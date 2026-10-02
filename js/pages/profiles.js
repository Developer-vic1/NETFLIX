import { el, button, field, select } from "../utils/dom.js";
import { t } from "../services/localization.service.js";
import {
  getProfiles,
  activeProfile,
  saveProfile,
  switchProfile,
  deleteProfile,
  PROFILE_COLORS,
} from "../services/profile.service.js";
import { avatar } from "../components/profile-menu.js";
import { openModal, closeModal } from "../components/modal.js";
import { toast } from "../components/toast.js";
export function renderProfiles({ root, navigate, refresh }) {
  const edit = (profile) => {
    const name = el("input", {
      id: "profile-name",
      value: profile?.name || "",
      required: true,
      maxlength: 24,
      autocomplete: "off",
    });
    const color = select(
      PROFILE_COLORS.map((value) => [value, t(`profiles.${value}`)]),
      profile?.color ||
        PROFILE_COLORS.find(
          (value) => !getProfiles().some((item) => item.color === value),
        ),
      { id: "profile-color" },
    );
    for (const option of color.options)
      option.disabled = getProfiles().some(
        (item) => item.id !== profile?.id && item.color === option.value,
      );
    const preview = el("div", {
      class: "profile-avatar-preview",
      "aria-label": t("profiles.preview"),
    });
    const previewName = el("strong");
    const updatePreview = () => {
      preview.replaceChildren(
        avatar({ color: color.value }, "avatar-large"),
        previewName,
      );
      previewName.textContent =
        name.value.trim() || profile?.name || t("profiles.add");
    };
    name.addEventListener("input", updatePreview);
    color.addEventListener("change", updatePreview);
    updatePreview();
    const form = el("form", { class: "profile-editor" }, [
      preview,
      el("div", { class: "stack profile-editor-fields" }, [
        field(t("profiles.name"), name),
        field(t("profiles.color"), color),
        el("small", { class: "muted", text: t("profiles.uniqueColors") }),
        el("button", {
          type: "submit",
          class: "button button-primary",
          text: t("profiles.save"),
        }),
      ]),
    ]);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        saveProfile(profile?.id, name.value, color.value);
        closeModal();
        refresh();
      } catch {
        toast(t("profiles.invalid"), "error");
      }
    });
    if (profile?.role !== "admin" && profile)
      form.querySelector(".profile-editor-fields").append(
        button(
          t("profiles.delete"),
          () => {
            if (deleteProfile(profile.id)) {
              closeModal();
              refresh();
            } else toast(t("profiles.last"), "warning");
          },
          "button button-ghost",
        ),
      );
    openModal({
      title: t(profile ? "profiles.edit" : "profiles.add"),
      content: form,
    });
  };
  root.append(
    el("div", { class: "container page profiles-page" }, [
      el("h1", { class: "page-title", text: t("profiles.choose") }),
      el("p", { class: "muted", text: t("profiles.subtitle") }),
      el(
        "div",
        { class: "profile-grid" },
        getProfiles().map((profile) =>
          el("article", { class: "profile-tile" }, [
            button(
              [
                avatar(profile, "avatar-large"),
                el("span", { text: profile.name }),
                el("small", {
                  text: t(
                    profile.role === "admin"
                      ? "profiles.admin"
                      : "profiles.viewer",
                  ),
                }),
              ],
              () => {
                try {
                  switchProfile(profile.id);
                  navigate(profile.role === "admin" ? "operations" : "home");
                } catch {
                  toast(t("common.storageError"), "error");
                }
              },
              "profile-select",
              {
                "aria-pressed": String(profile.id === activeProfile().id),
                "data-profile-id": profile.id,
              },
            ),
            button(t("profiles.edit"), () => edit(profile), "text-link"),
          ]),
        ),
      ),
      button(t("profiles.add"), () => edit(), "button button-ghost", {
        disabled: getProfiles().length >= 8,
      }),
    ]),
  );
}
