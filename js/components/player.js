import { el, button, select, field } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { t } from "../services/localization.service.js";
import { LANGUAGES } from "../config/languages.js";
import { QUALITIES } from "../services/streaming.service.js";
import { toast } from "./toast.js";
import { eventBus } from "../services/event-bus.service.js";
export function playerShell(preferences = {}) {
  const video = el("video", {
    playsinline: true,
    preload: "none",
    hidden: true,
  });
  // No src: avoid accidental media fetches and fake playback. TODO(student): connect approved media.
  const stage = el("div", { class: "player-stage", id: "player-stage" }, [
    video,
    el("div", { class: "player-placeholder" }, [
      icon("play"),
      el("span", { class: "badge badge-demo", text: t("common.demo") }),
      el("h2", { text: t("player.noMedia") }),
      el("p", { class: "muted", text: t("player.sourceTodo") }),
    ]),
  ]);
  const unconnected = () => toast(t("player.unconnected"), "warning");
  const progress = el("input", {
    type: "range",
    min: 0,
    max: 100,
    value: 0,
    disabled: true,
    "aria-label": t("player.progress"),
  });
  const volume = el("input", {
    type: "range",
    min: 0,
    max: 100,
    value: 70,
    class: "volume",
    "aria-label": t("player.volume"),
  });
  volume.addEventListener("input", () => {
    video.volume = Number(volume.value) / 100;
  });
  const controls = el("div", { class: "player-controls" }, [
    progress,
    el("div", { class: "player-controls-row" }, [
      button(icon("play"), unconnected, "icon-button", {
        "aria-label": t("player.play"),
      }),
      button(icon("pause"), unconnected, "icon-button", {
        "aria-label": t("player.pause"),
      }),
      icon("volume"),
      volume,
      el("span", { class: "time", text: "00:00 / --:--" }),
      button(icon("monitor"), unconnected, "icon-button", {
        "aria-label": t("player.cast"),
      }),
      button(
        icon("settings"),
        () => document.getElementById("player-quality")?.focus(),
        "icon-button",
        { "aria-label": t("player.settings") },
      ),
      button(
        icon("expand"),
        async () => {
          try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await stage.requestFullscreen();
          } catch {
            toast(t("common.error"), "error");
          }
        },
        "icon-button",
        { "aria-label": t("player.fullscreen") },
      ),
    ]),
  ]);
  const languageOptions = LANGUAGES.map((item) => [item.code, item.nativeName]);
  const quality = select(
    QUALITIES.map((item) => [item, item]),
    preferences.quality || "Auto",
    { id: "player-quality" },
  );
  quality.addEventListener("change", () =>
    eventBus.emit("QUALITY_CHANGED", `${quality.value} · DEMO preference`),
  );
  const audio = select(languageOptions, preferences.audio || "es", {
    id: "player-audio",
  });
  const subtitles = select(
    [["off", t("settings.off")], ...languageOptions],
    preferences.subtitles || "off",
    { id: "player-subtitles" },
  );
  return {
    stage,
    controls,
    quality,
    audio,
    subtitles,
    selectors: el("div", { class: "player-selectors" }, [
      field(t("player.audio"), audio),
      field(t("player.subtitles"), subtitles),
      field(t("player.quality"), quality),
    ]),
  };
}
