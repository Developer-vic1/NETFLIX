import { el, button } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { titles } from "../data/titles.js";
import { t, getLocalization } from "../services/localization.service.js";
import { formatTime, formatDuration } from "../utils/time.js";
import { profilePreferences } from "../services/profile.service.js";
import {
  ratingFor,
  saveRating,
  startOver,
} from "../services/catalog-tools.service.js";
import { downloadButton } from "../components/download-button.js";
import { movieCard } from "../components/movie-card.js";
import { toast } from "../components/toast.js";
import { stateView } from "../components/state.js";

export function renderTitle(context) {
  const { root, navigate, inList, toggleList } = context;
  const id = new URLSearchParams(location.hash.split("?")[1] || "").get(
    "title",
  );
  const title = titles.find((item) => item.id === id);
  if (!title) {
    root.append(
      el(
        "div",
        { class: "container page" },
        stateView("empty", t("common.noResults"), () => navigate("home")),
      ),
    );
    return;
  }
  const position = profilePreferences().playerPreferences?.positions?.[id];
  const canResume =
    Number.isFinite(position) && position > 1 && position < title.duration - 3;
  const time = formatTime(position);
  const list = button(
    [
      icon(inList(id) ? "check" : "plus"),
      t(inList(id) ? "title.remove" : "title.add"),
    ],
    () => {
      const added = toggleList(id);
      list.replaceChildren(
        icon(added ? "check" : "plus"),
        document.createTextNode(t(added ? "title.remove" : "title.add")),
      );
      list.setAttribute("aria-pressed", String(added));
    },
    "button button-ghost",
    { "aria-pressed": String(inList(id)), "data-list-id": id },
  );
  const play = button(
    [icon("play"), canResume ? t("detail.resume", { time }) : t("title.play")],
    () => navigate(`player?title=${id}`),
    "button button-light",
  );
  const actions = el("div", { class: "title-actions" }, [
    play,
    list,
    downloadButton(title, navigate),
  ]);
  if (canResume)
    actions.append(
      button(
        t("detail.startOver"),
        () => {
          if (!startOver(id)) {
            toast(t("common.storageError"), "warning");
            return;
          }
          navigate(`player?title=${id}`);
        },
        "button button-ghost",
      ),
    );
  const hero = el("section", { class: "title-hero" }, [
    el("img", {
      class: "title-backdrop",
      src: title.poster,
      alt: "",
      "aria-hidden": "true",
      width: 1280,
      height: 720,
    }),
    el("div", { class: "title-shade", "aria-hidden": "true" }),
    el("div", { class: "container title-hero-content" }, [
      button(
        [icon("arrow", true), t("common.back")],
        () => navigate(title.type === "series" ? "series" : "home"),
        "button button-ghost title-back",
      ),
      el("span", { class: "eyebrow accent", text: t(`title.${title.type}`) }),
      el("h1", { text: title.name }),
      el("p", {
        class: "title-facts",
        text: `${title.year} · ${formatDuration(title.duration, getLocalization().language)} · ${title.qualities.at(-1).quality}`,
      }),
      el("p", {
        class: "title-synopsis",
        text: title.description || t(title.descriptionKey),
      }),
      title.uploaded
        ? el("p", {
            class: "title-facts",
            text: `${title.genre} · ${title.ageRating === "all" ? t("library.allAges") : title.ageRating} · ${title.originalLanguage === "other" ? t("library.other") : new Intl.DisplayNames([getLocalization().language], { type: "language" }).of(title.originalLanguage)}`,
          })
        : null,
      actions,
    ]),
  ]);
  root.append(hero);
  const page = el("div", { class: "container title-body" });
  const ratingButtons = [];
  const rate = (value) => {
    const next = ratingFor(id) === value ? 0 : value;
    if (!saveRating(id, next)) {
      toast(t("common.storageError"), "warning");
      return;
    }
    for (const [node, choice] of ratingButtons)
      node.setAttribute("aria-pressed", String(choice === next));
    toast(t("common.saved"), "success");
  };
  for (const [value, key, symbol] of [
    [1, "detail.like", "check"],
    [-1, "detail.dislike", "close"],
  ]) {
    const node = button(
      [icon(symbol), t(key)],
      () => rate(value),
      "button button-ghost",
      { "aria-pressed": String(ratingFor(id) === value) },
    );
    ratingButtons.push([node, value]);
  }
  page.append(
    el("div", { class: "title-information" }, [
      el("section", { class: "panel" }, [
        el("h2", { text: t("detail.story") }),
        el("p", { text: title.description || t(title.descriptionKey) }),
        el("p", { class: "muted", text: title.creator }),
        el("div", { class: "panel-actions" }, [
          el("a", {
            href: title.source,
            target: "_blank",
            rel: "noopener noreferrer",
            class: "text-link",
            text: t("title.source"),
          }),
          el("a", {
            href: title.licenseSource,
            target: "_blank",
            rel: "noopener noreferrer",
            class: "text-link",
            text: t("detail.license"),
          }),
        ]),
      ]),
      el("section", { class: "panel title-rating" }, [
        el("h2", { text: t("detail.rating") }),
        el("p", { class: "muted", text: t("detail.ratingHint") }),
        el(
          "div",
          { class: "panel-actions" },
          ratingButtons.map(([node]) => node),
        ),
      ]),
    ]),
  );
  if (title.type === "series") {
    const episodes = title.episodes?.map((episode) => ({ ...episode, year: title.year, poster: episode.poster || title.poster })) || [title];
    page.append(
      el("section", { class: "catalog-section episode-section" }, [
        el("h2", { text: t("detail.episodes") }),
        el(
          "div",
          { class: "episode-list" },
          episodes.map((episode, index) =>
            el("article", { class: "episode-row" }, [
              el("span", { class: "episode-number", text: episode.season ? `${episode.season}·${episode.number}` : String(index + 1) }),
              button(
                el("img", {
                  src: episode.poster,
                  alt: episode.name,
                  width: 320,
                  height: 180,
                  loading: "lazy",
                }),
                () => navigate(`player?title=${episode.id}`),
                "episode-poster",
                { "aria-label": `${t("title.play")} · ${episode.name}` },
              ),
              el("div", { class: "episode-description" }, [
                el("h3", { text: episode.name }),
                el("small", {
                  class: "muted",
                  text: `${episode.year} · ${formatDuration(episode.duration, getLocalization().language)}`,
                }),
                el("p", { class: "muted", text: episode.description || (episode.descriptionKey ? t(episode.descriptionKey) : "") }),
              ]),
              downloadButton(episode, navigate),
            ]),
          ),
        ),
      ]),
    );
  }
  const more = titles
    .filter(
      (item) =>
        item.id !== id &&
        (item.type === title.type || item.id === "making-of-caminandes"),
    )
    .slice(0, 4);
  page.append(
    el("section", { class: "catalog-section" }, [
      el("h2", { text: t("detail.more") }),
      el(
        "div",
        { class: "catalog-grid" },
        more.map((item) => movieCard(item, context)),
      ),
    ]),
  );
  root.append(page);
}
