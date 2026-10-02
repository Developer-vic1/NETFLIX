import { el, button, debounce, select } from "../utils/dom.js";
import { sortTitles } from "../services/catalog-tools.service.js";
import { icon } from "../utils/icons.js";
import { titles } from "../data/titles.js";
import { t, getLocalization } from "../services/localization.service.js";
import { movieCard } from "../components/movie-card.js";
import { stateView } from "../components/state.js";
import { readPreferences } from "../services/storage.service.js";
import {
  profilePreferences,
  activeProfile,
} from "../services/profile.service.js";
import { APP_CONFIG } from "../config/app-config.js";
import { curatedTitles } from "../services/workspace.service.js";
export function renderHome(context) {
  const { root, route, navigate } = context;
  const section = (key, items, extra = {}) =>
    el("section", { class: "catalog-section", "aria-label": t(key) }, [
      el("div", { class: "section-header" }, el("h2", { text: t(key) })),
      items.length
        ? el(
            "div",
            {
              class: extra.continueWatching ? "continue-grid" : "catalog-grid",
            },
            items.map((title) => movieCard(title, { ...context, ...extra })),
          )
        : stateView(
            "empty",
            key === "nav.myList"
              ? t("home.myListEmpty")
              : t("common.noResults"),
          ),
    ]);
  if (route === "home") {
    root.append(
      el("section", { class: "hero", "aria-label": t("hero.title") }, [
        el("img", {
          class: "hero-image",
          src: "assets/backgrounds/sintel.webp",
          alt: "",
          width: 2048,
          height: 872,
          fetchpriority: "high",
          "aria-hidden": "true",
        }),
        el("div", { class: "hero-shade", "aria-hidden": "true" }),
        el("div", { class: "container" }, [
          el("div", { class: "hero-content" }, [
            el("span", { class: "eyebrow", text: t("hero.eyebrow") }),
            el("h1", { class: "sr-only", text: t("hero.title") }),
            el("img", {
              class: "hero-title-art",
              src: "assets/title-art/sintel.png",
              alt: "Sintel",
              width: 480,
              height: 210,
            }),
            el("p", { class: "hero-description", text: t("hero.description") }),
            el("div", { class: "hero-actions" }, [
              button(
                [icon("play"), t("hero.explore")],
                () => navigate("player?title=sintel"),
                "button button-light",
              ),
              button(
                [icon("info"), t("hero.secondary")],
                () => navigate("title?title=sintel"),
                "button button-ghost",
              ),
            ]),
          ]),
          el("div", { class: "hero-bottom" }, [
            el("span", { class: "hero-index", text: t("hero.edition") }),
            el("span", { text: t("hero.art") }),
          ]),
        ]),
      ]),
    );
  }
  const page = el("div", {
    class: `container${route === "home" ? "" : " page"}`,
  });
  root.append(page);
  const curated = curatedTitles(getLocalization().region);
  if (route === "home" && curated.length)
    page.append(section("workspace.curation", curated));
  let initialItems = titles;
  if (route === "series" || route === "movies")
    initialItems = titles.filter((title) => title.type === route);
  if (route === "new") initialItems = titles.filter((title) => title.isNew);
  if (route === "my-list")
    initialItems = titles.filter((title) => context.inList(title.id));
  if (route !== "home") {
    const key = {
      series: "nav.series",
      movies: "nav.movies",
      new: "nav.new",
      "my-list": "nav.myList",
      search: "nav.search",
    }[route];
    page.append(el("h1", { class: "page-title", text: t(key) }));
  }
  const search = el("input", {
    type: "search",
    id: "catalog-search",
    placeholder: t("home.searchHint"),
    autocomplete: "off",
  });
  const searchStatus = el("p", {
    class: "sr-only",
    role: "status",
    "aria-live": "polite",
  });
  const content = el("div", { id: "catalog-content" });
  const chips = el("div", {
    class: "tab-list",
    "aria-label": t("home.catalog"),
  });
  let filter = "all";
  const order = select(
    ["original", "name", "newest", "shortest"].map((value) => [
      value,
      t(`catalog.${value}`),
    ]),
    "original",
    { id: "catalog-sort", "aria-label": t("catalog.sort") },
  );
  const drawCatalog = () => {
    const query = search.value
      .trim()
      .toLocaleLowerCase(getLocalization().language);
    const filtered = initialItems.filter(
      (title) =>
        (filter === "all" || title.type === filter) &&
        `${title.name} ${t(`title.${title.type}`)} ${title.description || t(title.descriptionKey)} ${title.genre || ""} ${title.creator || ""}`
          .toLocaleLowerCase(getLocalization().language)
          .includes(query),
    );
    content.dataset.searchState = query
      ? filtered.length
        ? "results"
        : "no-results"
      : "idle";
    searchStatus.textContent = t("home.searchStatus", {
      count: filtered.length,
    });
    content.replaceChildren(
      section(
        route === "my-list" ? "nav.myList" : "home.catalog",
        sortTitles(filtered, order.value),
      ),
    );
  };
  for (const [key, label] of [
    ["all", "common.all"],
    ["series", "nav.series"],
    ["movies", "nav.movies"],
    ["documentaries", "home.documentaries"],
  ]) {
    const chip = button(
      t(label),
      () => {
        filter = key;
        for (const node of chips.children)
          node.setAttribute("aria-pressed", String(node === chip));
        drawCatalog();
      },
      "filter-chip",
      { "aria-pressed": String(key === "all") },
    );
    chips.append(chip);
  }
  const runSearch = debounce(drawCatalog, APP_CONFIG.searchDelay);
  order.addEventListener("change", drawCatalog);
  search.addEventListener("input", () => {
    content.dataset.searchState = "typing";
    runSearch();
  });
  page.append(
    el("div", { class: "home-toolbar" }, [
      chips,
      order,
      el("label", { class: "search-box" }, [
        el("span", { class: "sr-only", text: t("nav.search") }),
        search,
      ]),
    ]),
    searchStatus,
    el("h2", {
      id: "catalog-heading",
      class: "sr-only",
      tabindex: "-1",
      text: t("home.catalog"),
    }),
  );
  if (route === "home") {
    const preferences = profilePreferences().playerPreferences || {};
    const trending = titles.filter((title) => title.isTrending);
    if (trending.length) page.append(section("home.trending", trending));
    const watched = preferences.progress || {};
    const continuing = titles
      .filter(
        (title) =>
          Number.isFinite(watched[title.id]) &&
          watched[title.id] > 0 &&
          watched[title.id] < 95,
      )
      .map((title) => ({ ...title, progress: Math.round(watched[title.id]) }));
    if (continuing.length)
      page.append(
        section("home.continue", continuing, { continueWatching: true }),
      );
    if (preferences.favoriteType && preferences.favoriteType !== "all") {
      const personal = section(
        "home.preferences",
        titles.filter((title) => title.type === preferences.favoriteType),
      );
      personal.querySelector("h2").textContent = t("home.forProfile", {
        name: activeProfile().name,
      });
      personal.querySelector(".section-header").append(
        el("a", {
          href: "#/settings",
          class: "text-link",
          text: t("home.preferences"),
        }),
      );
      page.append(personal);
    }
  }
  page.append(content);
  drawCatalog();
  if (route === "home") {
    page.append(
      section(
        "home.genre.animation",
        titles.filter((title) =>
          ["spring", "big-buck-bunny", "caminandes-2", "caminandes-3"].includes(
            title.id,
          ),
        ),
      ),
      section(
        "nav.myList",
        titles.filter((title) => context.inList(title.id)),
      ),
      section(
        "nav.series",
        titles.filter((title) => title.type === "series"),
      ),
      section(
        "nav.movies",
        titles.filter((title) => title.type === "movies"),
      ),
      section(
        "home.documentaries",
        titles.filter((title) => title.type === "documentaries"),
      ),
      section(
        "home.new",
        titles.filter((title) => title.isNew),
      ),
      el("section", { class: "panel home-todo catalog-section" }, [
        el("div", {}, [
          el("h2", { text: t("downloads.heading") }),
          el("p", { class: "muted", text: t("downloads.subtitle") }),
        ]),
        button(
          [t("downloads.title"), icon("arrow", true)],
          () => navigate("downloads"),
          "button button-primary",
        ),
      ]),
    );
  }
  if (route === "search") search.focus();
  return () => runSearch.cancel();
}
