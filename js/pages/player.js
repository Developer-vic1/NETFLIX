import { el, button } from "../utils/dom.js";
import { t, getLocalization } from "../services/localization.service.js";
import { icon } from "../utils/icons.js";
import { formatDuration } from "../utils/time.js";
import { mediaPlayer } from "../components/media-player.js";
import { titles } from "../data/titles.js";
import { toast } from "../components/toast.js";
import {
  profilePreferences,
  saveProfilePreferences,
} from "../services/profile.service.js";
import { downloadButton } from "../components/download-button.js";
import { offlineSource } from "../services/download.service.js";
import { nextTitle } from "../services/catalog-tools.service.js";
import { stateView } from "../components/state.js";
export function renderPlayer({ root, navigate }) {
  const preferences = profilePreferences().playerPreferences || {};
  const titleId = new URLSearchParams(location.hash.split("?")[1] || "").get(
    "title",
  );
  const title = titles.find((item) => item.id === titleId);
  if (!title) {
    root.append(el("div", { class: "container page" }, [
      stateView("empty", t("player.unavailable")),
      button(t("common.back"), () => navigate("home"), "button button-ghost"),
    ]));
    return;
  }
  const useOffline =
    new URLSearchParams(location.hash.split("?")[1] || "").has("offline") ||
    !navigator.onLine;
  const player = mediaPlayer(
    title,
    useOffline
      ? { ...preferences, quality: offlineSource(title).quality }
      : preferences,
  );
  const savePreferences = () => {
    const stored = saveProfilePreferences({
      playerPreferences: {
        ...profilePreferences().playerPreferences,
        quality: player.quality.value,
        speed: Number(player.speed.value),
        volume: player.video.volume,
        muted: player.video.muted,
      },
    });
    toast(
      t(stored ? "common.saved" : "common.storageError"),
      stored ? "success" : "warning",
    );
  };
  player.settingsPanel
    .querySelector(".playback-settings-actions")
    .append(
      button(
        [icon("check"), t("common.save")],
        savePreferences,
        "button button-primary",
      ),
    );
  const following = nextTitle(title);
  const download = downloadButton(title, navigate);
  download.className = "button button-ghost";
  download.append(t(title.uploaded && title.localAsset?.startsWith("blob:") ? "library.offline" : "downloads.save"));
  const shortcuts = el("details", { class: "watch-shortcuts" }, [
    el("summary", { text: t("player.keyboard") }),
    el("p", { text: t("player.shortcuts") }),
  ]);
  root.append(
    el("div", { class: "container page watch-page" }, [
      el("div", { class: "page-header watch-header" }, [
        el("div", {}, [
          el("h1", { class: "page-title", text: title.name }),
          el("div", { class: "watch-metadata" }, [
            el("span", { class: "watch-chip", text: title.year }),
            el("span", {
              class: "watch-chip",
              text: formatDuration(title.duration, getLocalization().language),
            }),
            el("span", { class: "watch-creator", text: title.creator }),
          ]),
        ]),
        button(t("common.back"), () => navigate("home"), "button button-ghost"),
      ]),
      player.shell,
      el("div", { class: "watch-actions" }, [
        el("div", { class: "watch-action-buttons" }, [
          download,
          button(
            [icon("info"), t("common.details")],
            () => navigate(`title?title=${title.seriesId || title.id}`),
            "button button-ghost",
          ),
          el("a", {
            class: "text-link",
            href: title.watchSource,
            target: "_blank",
            rel: "noopener noreferrer",
            text: t("player.openSource"),
          }),
        ]),
        shortcuts,
      ]),
      el("div", { class: "watch-workspace" }, [
        player.settingsPanel,
        el("aside", { class: "watch-next", "aria-label": t("player.upNext") }, [
          el("div", { class: "watch-next-heading" }, [
            icon("play"),
            el("h2", { text: t("player.upNext") }),
          ]),
          el("img", {
            src: following.poster,
            alt: "",
            width: 640,
            height: 360,
            loading: "lazy",
          }),
          el("div", { class: "watch-next-info" }, [
            el("h3", { text: following.name }),
            el("p", {
              class: "muted",
              text: `${following.year} · ${formatDuration(following.duration, getLocalization().language)}`,
            }),
            button(
              [icon("play"), t("player.next")],
              () => navigate(`player?title=${following.id}`),
              "button button-light",
            ),
          ]),
        ]),
      ]),
    ]),
  );
  const next = () => {
    if (preferences.autoplay && navigator.onLine)
      navigate(`player?title=${nextTitle(title).id}&autoplay=1`);
  };
  player.video.addEventListener("ended", next);
  if (new URLSearchParams(location.hash.split("?")[1] || "").has("autoplay"))
    player.video.play().catch(() => {});
  return () => {
    player.video.removeEventListener("ended", next);
    player.destroy();
  };
}
