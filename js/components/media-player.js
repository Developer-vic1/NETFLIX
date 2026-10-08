import { el, button, select, field } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { t, getLocalization } from "../services/localization.service.js";
import { eventBus } from "../services/event-bus.service.js";
import { telemetry } from "../services/session-telemetry.service.js";
import { recordProgress } from "../services/viewing-history.service.js";
import { toast } from "./toast.js";
import { activeProfile } from "../services/profile.service.js";
import { mediaSource, offlineSource } from "../services/download.service.js";
import { observePlayback } from "../services/quality-observer.service.js";
import { formatTime } from "../utils/time.js";
import { pictureInPicture } from "../services/picture-in-picture.service.js";
import { playerWindowMessage } from "../data/player-window-copy.js";
export function mediaPlayer(title, preferences = {}) {
  const profileId = activeProfile().id;
  const saveProgress = () => {
    if (video.currentTime > 0)
      recordProgress(title.id, video.currentTime, video.duration, profileId);
  };
  const sources = title.uploaded
    ? title.qualities
    : title.qualities.filter((item) => item.quality !== "240p");
  const preferred = sources.some((item) => item.quality === preferences.quality)
    ? preferences.quality
    : offlineSource(title).quality;
  const selected =
    sources.find((item) => item.quality === preferred) || sources[0];
  const remembered = preferences.positions?.[title.id];
  const initialPosition =
    Number.isFinite(remembered) &&
    remembered > 0 &&
    remembered < title.duration - 3
      ? remembered
      : 0;
  const sourceUrl = (quality) => mediaSource(title, quality);
  const video = el("video", {
    playsinline: true,
    preload: "none",
    poster: title.poster,
    src: sourceUrl(selected.quality),
    "aria-label": title.name,
  });
  const progress = el("input", {
    type: "range",
    min: 0,
    max: 100,
    step: 0.1,
    value: title.duration ? (initialPosition / title.duration) * 100 : 0,
    class: "player-progress",
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
  const time = el("span", {
    class: "time",
    text: `${formatTime(initialPosition)} / ${formatTime(title.duration)}`,
  });
  progress.style.setProperty("--level", `${progress.value}%`);
  progress.setAttribute("aria-valuetext", time.textContent);
  const status = el("p", { class: "sr-only", role: "status" });
  const errorPanel = el("div", { class: "player-error", hidden: true }, [
    el("p", { text: t("player.mediaError") }),
    button(
      t("player.retry"),
      () => {
        video.load();
        void play();
      },
      "button button-primary",
    ),
    el("a", {
      href: title.watchSource,
      target: "_blank",
      rel: "noopener noreferrer",
      class: "button",
      text: t("player.openSource"),
    }),
  ]);
  const loading = el("span", {
    class: "player-spinner",
    hidden: true,
    "aria-label": t("state.loading"),
  });
  let disposed = false,
    bufferingEvents = 0,
    lastSaved = 0;
  const report = (state) => {
    const quality = video.getVideoPlaybackQuality?.();
    telemetry.updatePlayback({
      title: title.name,
      state,
      currentTime: video.currentTime,
      duration: Number.isFinite(video.duration)
        ? video.duration
        : title.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      totalFrames: quality?.totalVideoFrames || 0,
      droppedFrames: quality?.droppedVideoFrames || 0,
      bufferingEvents,
    });
  };
  const play = async () => {
    try {
      errorPanel.hidden = true;
      await video.play();
    } catch (error) {
      if (!disposed && error.name !== "AbortError") {
        status.textContent = t("player.mediaError");
        errorPanel.hidden = false;
      }
    }
  };
  const togglePlayback = () => (video.paused ? void play() : video.pause());
  const playButton = button(
    icon("play"),
    togglePlayback,
    "icon-button player-toggle",
    {
      "aria-label": t("player.play"),
      "aria-keyshortcuts": "Space K",
    },
  );
  const centerPlay = button(icon("play"), play, "player-center-play", {
    "aria-label": `${t("player.play")} · ${title.name}`,
  });
  const feedback = el("span", {
    class: "player-feedback",
    role: "status",
    hidden: true,
  });
  let feedbackTimer;
  const flash = (message) => {
    clearTimeout(feedbackTimer);
    feedback.textContent = message;
    feedback.hidden = false;
    feedbackTimer = setTimeout(() => {
      feedback.hidden = true;
    }, 900);
  };
  const syncPlayback = () => {
    const label = t(video.paused ? "player.play" : "player.pause");
    playButton.replaceChildren(icon(video.paused ? "play" : "pause"));
    playButton.setAttribute("aria-label", label);
    playButton.title = `${label} (K)`;
    shell.dataset.playback = video.paused ? "paused" : "playing";
    revealControls();
  };
  const stage = el("div", { class: "player-stage", id: "player-stage" }, [
    video,
    centerPlay,
    loading,
    errorPanel,
    feedback,
  ]);
  video.addEventListener("click", togglePlayback);
  video.volume = Number.isFinite(preferences.volume)
    ? Math.max(0, Math.min(1, preferences.volume))
    : 0.7;
  video.muted = preferences.muted === true;
  volume.value = String(Math.round(video.volume * 100));
  volume.style.setProperty("--level", `${volume.value}%`);
  const listen = (name, callback) => video.addEventListener(name, callback);
  listen("play", () => {
    syncPlayback();
    centerPlay.hidden = true;
    report("playing");
    eventBus.emit("PLAY_STARTED", `${title.id} · ${qualitySelect.value}`, {
      profileId,
    });
  });
  listen("pause", () => {
    if (disposed) return;
    syncPlayback();
    centerPlay.hidden = false;
    loading.hidden = true;
    report("paused");
    saveProgress();
    eventBus.emit("PLAY_PAUSED", title.id);
  });
  listen("playing", () => {
    loading.hidden = true;
    report("playing");
  });
  listen("waiting", () => {
    if (!video.paused) {
      bufferingEvents++;
      loading.hidden = false;
      report("buffering");
      eventBus.emit("BUFFERING_STARTED", title.id);
    }
  });
  listen("loadedmetadata", () => {
    time.textContent = `00:00 / ${formatTime(video.duration)}`;
    report(video.paused ? "ready" : "playing");
  });
  video.addEventListener(
    "loadedmetadata",
    () => {
      const position = preferences.positions?.[title.id];
      if (
        Number.isFinite(position) &&
        position > 1 &&
        position < video.duration - 3
      )
        video.currentTime = position;
    },
    { once: true },
  );
  listen("timeupdate", () => {
    if (!Number.isFinite(video.duration) || !video.duration) return;
    progress.value = String((video.currentTime / video.duration) * 100);
    progress.style.setProperty("--level", `${progress.value}%`);
    progress.setAttribute(
      "aria-valuetext",
      `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`,
    );
    time.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    if (Math.abs(video.currentTime - lastSaved) >= 5) {
      lastSaved = video.currentTime;
      saveProgress();
      report(video.paused ? "paused" : "playing");
    }
  });
  listen("ended", () => {
    syncPlayback();
    centerPlay.hidden = false;
    report("ended");
    saveProgress();
    eventBus.emit("PLAY_ENDED", title.id);
  });
  listen("error", () => {
    loading.hidden = true;
    errorPanel.hidden = false;
    report("error");
    eventBus.emit(
      "PLAY_ERROR",
      `${title.id} · media code ${video.error?.code}`,
    );
  });
  progress.addEventListener("input", () => {
    if (Number.isFinite(video.duration))
      video.currentTime = (Number(progress.value) / 100) * video.duration;
  });
  volume.addEventListener("input", () => {
    video.volume = Number(volume.value) / 100;
  });
  const qualitySelect = select(
    sources.map((source) => [source.quality, source.quality]),
    selected.quality,
    { id: "player-quality", disabled: !navigator.onLine },
  );
  const networkChanged = () => {
    qualitySelect.disabled = !navigator.onLine;
  };
  window.addEventListener("online", networkChanged);
  window.addEventListener("offline", networkChanged);
  qualitySelect.addEventListener("change", async () => {
    if (restorePosition)
      video.removeEventListener("loadedmetadata", restorePosition);
    const position = video.currentTime,
      wasPlaying = !video.paused;
    video.pause();
    loading.hidden = false;
    restorePosition = () => {
      restorePosition = null;
      if (disposed) return;
      video.currentTime = Math.min(position, video.duration);
      loading.hidden = true;
      if (wasPlaying) void play();
    };
    video.addEventListener("loadedmetadata", restorePosition, { once: true });
    video.src = sourceUrl(qualitySelect.value);
    video.load();
    eventBus.emit("QUALITY_CHANGED", `${title.id} · ${qualitySelect.value}`);
  });
  let restorePosition = null;
  const speed = select(
    [0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => [String(value), `${value}×`]),
    [0.5, 0.75, 1, 1.25, 1.5, 2].includes(preferences.speed)
      ? String(preferences.speed)
      : "1",
    { id: "player-speed" },
  );
  video.playbackRate = Number(speed.value);
  speed.addEventListener("change", () => {
    video.playbackRate = Number(speed.value);
    eventBus.emit("PLAYBACK_SPEED_CHANGED", `${title.id} · ${speed.value}`);
  });
  const mute = button(
    icon("volume"),
    () => {
      video.muted = !video.muted;
    },
    "icon-button",
    { "aria-label": t("player.mute"), "aria-pressed": "false" },
  );
  listen("volumechange", () => {
    mute.setAttribute(
      "aria-label",
      t(video.muted ? "player.unmute" : "player.mute"),
    );
    mute.setAttribute("aria-pressed", String(video.muted));
    volume.value = String(Math.round(video.volume * 100));
    volume.style.setProperty("--level", `${volume.value}%`);
  });
  const pip = button(
    t("player.pip"),
    () => void floatingPlayer.toggle(),
    "button button-ghost",
    { disabled: true },
  );
  const floatingPlayer = pictureInPicture(video, {
    onChange({ active, available, pending }) {
      pip.disabled = pending || !available;
      pip.textContent = t(active ? "player.exitPip" : "player.pip");
      pip.setAttribute("aria-pressed", String(active));
      pip.setAttribute("aria-busy", String(pending));
    },
    onError(error) {
      console.warn("Floating video window:", error.name, error.message);
      toast(playerWindowMessage(getLocalization().language, error), "warning");
    },
  });
  const audio = select([["original", t("player.originalAudio")]], "original", {
    id: "player-audio",
    disabled: true,
  });
  const subtitles = select([["off", t("settings.off")]], "off", {
    id: "player-subtitles",
    disabled: true,
  });
  const controls = el("div", { class: "player-controls" }, [
    progress,
    el("div", { class: "player-controls-row" }, [
      el("div", { class: "playback-buttons" }, [
        playButton,
        button("−10 s", () => seekBy(-10), "icon-button seek-button", {
          "aria-keyshortcuts": "ArrowLeft J",
        }),
        button("+10 s", () => seekBy(10), "icon-button seek-button", {
          "aria-keyshortcuts": "ArrowRight L",
        }),
      ]),
      el("div", { class: "player-volume" }, [mute, volume]),
      time,
      el("div", { class: "playback-tools" }, [
        button(
          icon("settings"),
          () => {
            settingsPanel.open = true;
            qualitySelect.focus({ preventScroll: true });
            settingsPanel.scrollIntoView({
              behavior: "smooth",
              block: "nearest",
            });
          },
          "icon-button",
          {
            "aria-label": t("player.settings"),
            "aria-controls": "playback-settings",
          },
        ),
        button(icon("expand"), () => void toggleFullscreen(), "icon-button", {
          "aria-label": t("player.fullscreen"),
        }),
      ]),
    ]),
    status,
  ]);
  const selectors = el("div", { class: "player-selectors" }, [
    field(t("player.quality"), qualitySelect, t("player.qualityActual")),
    field(t("player.speed"), speed),
    el("div", { class: "player-track-fields" }, [
      field(t("player.audio"), audio),
      field(t("player.subtitles"), subtitles, t("player.noSubtitles")),
    ]),
  ]);
  const settingsPanel = el(
    "details",
    { class: "playback-settings", id: "playback-settings", open: true },
    [
      el("summary", {}, [
        icon("settings"),
        el("span", {}, [
          el("strong", { text: t("player.settings") }),
          el("small", { text: t("player.personalize") }),
        ]),
        icon("arrow"),
      ]),
      el("div", { class: "playback-settings-body" }, [
        selectors,
        el("div", { class: "playback-settings-actions" }, [pip]),
      ]),
    ],
  );
  const shell = el(
    "div",
    { class: "player-shell", tabindex: 0, "aria-label": t("player.shortcuts") },
    [stage, controls],
  );
  let controlsTimer;
  const revealControls = () => {
    clearTimeout(controlsTimer);
    shell.dataset.controls = "visible";
    if (!video.paused)
      controlsTimer = setTimeout(() => {
        if (!video.paused && !shell.querySelector(":focus-visible"))
          shell.dataset.controls = "hidden";
      }, 3000);
  };
  shell.addEventListener("pointermove", revealControls);
  shell.addEventListener("pointerdown", revealControls);
  shell.addEventListener("focusin", revealControls);
  shell.addEventListener("keydown", revealControls);
  const seekBy = (delta) => {
    if (!Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(
      0,
      Math.min(video.duration, video.currentTime + delta),
    );
    flash(`${delta > 0 ? "+" : "−"}${Math.abs(delta)} s`);
  };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shell.requestFullscreen();
    } catch {
      toast(t("common.error"), "error");
    }
  };
  const keyboard = (event) => {
    if (
      disposed ||
      !shell.isConnected ||
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    if (!(event.target instanceof Element)) return;
    if (document.querySelector("dialog[open], .cinema-intro")) return;
    if (
      event.target.closest('input, select, textarea, [contenteditable="true"]')
    )
      return;
    const key = event.key.toLowerCase();
    if (
      event.repeat &&
      (event.code === "Space" || ["k", "m", "f"].includes(key))
    )
      return;
    if (event.code === "Space" && event.target.closest("button, a")) return;
    let handled = true;
    if (event.code === "Space" || key === "k") {
      const wasPaused = video.paused;
      togglePlayback();
      flash(t(wasPaused ? "player.play" : "player.pause"));
    } else if (key === "arrowright" || key === "l") seekBy(10);
    else if (key === "arrowleft" || key === "j") seekBy(-10);
    else if (key === "m") {
      video.muted = !video.muted;
      flash(t(video.muted ? "player.mute" : "player.unmute"));
    } else if (key === "arrowup" || key === "arrowdown") {
      video.volume = Math.max(
        0,
        Math.min(1, video.volume + (key === "arrowup" ? 0.05 : -0.05)),
      );
      flash(`${Math.round(video.volume * 100)}%`);
    } else if (key === "f") void toggleFullscreen();
    else handled = false;
    if (handled) {
      event.preventDefault();
      revealControls();
    }
  };
  document.addEventListener("keydown", keyboard);
  syncPlayback();
  report("idle");
  const observation = observePlayback(video, title, qualitySelect);
  return {
    shell,
    stage,
    controls,
    selectors,
    settingsPanel,
    video,
    quality: qualitySelect,
    speed,
    audio,
    subtitles,
    destroy() {
      if (disposed) return;
      floatingPlayer.destroy();
      document.removeEventListener("keydown", keyboard);
      clearTimeout(feedbackTimer);
      clearTimeout(controlsTimer);
      window.removeEventListener("online", networkChanged);
      window.removeEventListener("offline", networkChanged);
      if (restorePosition)
        video.removeEventListener("loadedmetadata", restorePosition);
      saveProgress();
      report("paused");
      disposed = true;
      video.pause();
      observation.destroy();
      video.removeAttribute("src");
      video.load();
    },
  };
}
