import { el, button } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { t, getLocalization } from "../services/localization.service.js";
import { formatDuration } from "../utils/time.js";
import { downloadButton } from "./download-button.js";
export function movieCard(
  title,
  { inList, toggleList, navigate, state = "ready", continueWatching = false },
) {
  const name = title.name;
  const card = el("article", { class: "movie-card", "data-state": state });
  if (state === "error" || state === "loading") {
    card.append(
      el("div", {
        class: "movie-poster poster-1",
        role: "status",
        text: t(`state.${state}`),
      }),
    );
    return card;
  }
  card.append(
    el(
      "div",
      { class: "movie-poster", "aria-hidden": "true" },
      el("img", {
        class: "poster-img",
        src: title.poster,
        alt: "",
        loading: "lazy",
        decoding: "async",
        width: 640,
        height: 360,
      }),
    ),
  );
  if (continueWatching) {
    const progress = el("div", { class: "progress-fill" });
    progress.style.width = `${title.progress}%`;
    card.append(
      el(
        "div",
        {
          class: "progress-track",
          role: "progressbar",
          "aria-valuemin": 0,
          "aria-valuemax": 100,
          "aria-valuenow": title.progress,
          "aria-label": name,
        },
        progress,
      ),
    );
  }
  const added = inList(title.id);
  const listButton = button(
    icon(added ? "check" : "plus"),
    () => {
      const isAdded = toggleList(title.id);
      listButton.replaceChildren(icon(isAdded ? "check" : "plus"));
      listButton.setAttribute(
        "aria-label",
        `${t(isAdded ? "title.remove" : "title.add")} · ${name}`,
      );
      listButton.setAttribute("aria-pressed", String(isAdded));
    },
    "icon-button",
    {
      "aria-label": `${t(added ? "title.remove" : "title.add")} · ${name}`,
      "aria-pressed": String(added),
      "data-list-id": title.id,
    },
  );
  card.append(
    el("div", { class: "movie-info" }, [
      el("h3", { text: name }),
      el("p", {
        class: "movie-meta",
        text: continueWatching
          ? t("title.progress", { progress: title.progress })
          : `${title.year} · ${t(`title.${title.type}`)} · ${formatDuration(title.duration, getLocalization().language)}`,
      }),
      el("div", { class: "card-actions" }, [
        button(
          icon("play"),
          () => navigate(`player?title=${title.id}`),
          "icon-button",
          { "aria-label": `${t("title.play")} · ${name}` },
        ),
        listButton,
        downloadButton(title, navigate),
      ]),
      button(
        t("common.details"),
        () => navigate(`title?title=${title.id}`),
        "text-link",
        { "aria-label": `${t("common.details")} · ${name}` },
      ),
    ]),
  );
  return card;
}
