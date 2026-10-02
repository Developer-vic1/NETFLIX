import { el, button } from "../utils/dom.js";
import { t } from "../services/localization.service.js";
import { icon } from "../utils/icons.js";
let overlay, timer, audioContext, animationFrame;
async function playSound(duration) {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  audioContext?.close().catch(() => {});
  audioContext = new Audio();
  // Autoplay may be blocked; the sound button retries within a user gesture.
  const soundContext = audioContext;
  const soundOverlay = overlay;
  const soundButton = overlay?.querySelector(".intro-sound");
  const updateSoundButton = () => {
    if (!soundButton?.isConnected || !audioContext) return;
    soundButton.replaceChildren(
      icon("volume"),
      t(audioContext.state === "running" ? "intro.sound" : "intro.enableAudio"),
    );
  };
  audioContext.addEventListener("statechange", updateSoundButton);
  updateSoundButton();
  try {
    await soundContext.resume();
  } catch {
    return;
  }
  if (
    audioContext !== soundContext ||
    overlay !== soundOverlay ||
    soundContext.state !== "running"
  )
    return;
  // Drive the visuals from the audio clock, including device startup latency.
  const animations = soundOverlay.getAnimations({ subtree: true });
  for (const animation of animations) {
    animation.pause();
    animation.currentTime = 0;
  }
  clearTimeout(timer);
  timer = setTimeout(closeIntro, duration + 2000);
  const now = soundContext.currentTime;
  soundOverlay.dataset.audioStart = String(now);
  const followAudio = () => {
    if (overlay !== soundOverlay || audioContext !== soundContext) return;
    const elapsed = (soundContext.currentTime - now) * 1000;
    for (const animation of animations) animation.currentTime = elapsed;
    if (elapsed >= duration) closeIntro();
    else animationFrame = requestAnimationFrame(followAudio);
  };
  animationFrame = requestAnimationFrame(followAudio);
  // Original synthesized two-impact cue; no downloaded studio recording.
  for (const [offset, frequency, strength] of [
    [0.24, 65, 0.35],
    [0.72, 49, 0.5],
  ]) {
    for (const multiplier of [1, 2, 3]) {
      const oscillator = audioContext.createOscillator(),
        gain = audioContext.createGain();
      oscillator.type = multiplier === 1 ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(
        frequency * multiplier * 1.3,
        now + offset,
      );
      oscillator.frequency.exponentialRampToValueAtTime(
        frequency * multiplier,
        now + offset + 0.2,
      );
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(
        strength / (multiplier * 2),
        now + offset + 0.025,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 1.25);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 1.3);
    }
  }
  const shimmer = audioContext.createOscillator(),
    envelope = audioContext.createGain();
  shimmer.type = "sine";
  const beamStart = (duration * 0.55) / 1000;
  shimmer.frequency.setValueAtTime(650, now + beamStart);
  shimmer.frequency.exponentialRampToValueAtTime(1300, now + beamStart + 0.8);
  envelope.gain.setValueAtTime(0.0001, now + beamStart);
  envelope.gain.exponentialRampToValueAtTime(0.035, now + beamStart + 0.15);
  envelope.gain.exponentialRampToValueAtTime(
    0.0001,
    now + duration / 1000 - 0.15,
  );
  shimmer.connect(envelope).connect(audioContext.destination);
  shimmer.start(now + beamStart);
  shimmer.stop(now + duration / 1000 - 0.1);
}
export function closeIntro() {
  clearTimeout(timer);
  cancelAnimationFrame(animationFrame);
  const previousFocus = overlay?.previousFocus;
  overlay?.remove();
  overlay = null;
  document.body.classList.remove("intro-open");
  for (const id of ["app", "header", "footer"])
    document.getElementById(id)?.removeAttribute("inert");
  if (previousFocus?.isConnected && previousFocus !== document.body)
    previousFocus.focus({ preventScroll: true });
  if (audioContext) {
    void audioContext.close().catch(() => {});
    audioContext = null;
  }
}
export function showIntro(withSound = true, duration = 3600) {
  closeIntro();
  if (
    matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.classList.contains("reduce-motion")
  )
    return;
  overlay = el(
    "div",
    {
      class: "cinema-intro",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": t("intro.label"),
      tabindex: -1,
    },
    [
      el("div", { class: "intro-n", "aria-hidden": "true" }, [
        el("span", { class: "n-left" }),
        el("span", { class: "n-right" }),
        el("span", { class: "n-diagonal" }),
      ]),
      el(
        "div",
        { class: "intro-beams", "aria-hidden": "true" },
        Array.from({ length: 36 }, (_, index) => {
          const beam = el("i");
          beam.style.setProperty("--beam-index", index);
          return beam;
        }),
      ),
      el("div", { class: "intro-actions" }, [
        button(
          [icon("volume"), t("intro.sound")],
          () => showIntro(true),
          "button button-ghost intro-sound",
        ),
        button(t("intro.skip"), closeIntro, "button button-ghost"),
      ]),
    ],
  );
  overlay.previousFocus = document.activeElement;
  overlay.style.setProperty("--intro-duration", `${duration}ms`);
  overlay.style.setProperty("--intro-speed", duration / 3000);
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeIntro();
    if (event.key === "Tab") {
      const buttons = [...overlay.querySelectorAll("button")];
      if (
        event.shiftKey &&
        (document.activeElement === buttons[0] ||
          document.activeElement === overlay)
      ) {
        event.preventDefault();
        buttons.at(-1).focus();
      } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
        event.preventDefault();
        buttons[0].focus();
      }
    }
  });
  document.body.append(overlay);
  document.body.classList.add("intro-open");
  for (const id of ["app", "header", "footer"])
    document.getElementById(id)?.setAttribute("inert", "");
  overlay.focus({ preventScroll: true });
  timer = setTimeout(closeIntro, duration);
  if (withSound) void playSound(duration);
}
