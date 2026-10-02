import { el, button } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { t, getLocalization } from "../services/localization.service.js";
import { openDrawer } from "./drawer.js";
import { openNotifications } from "./notification-center.js";
import { profileMenu, avatar } from "./profile-menu.js";
import { activeProfile } from "../services/profile.service.js";
import { unreadCount } from "../services/notification.service.js";
const routes = [
  ["home", "nav.home"],
  ["series", "nav.series"],
  ["movies", "nav.movies"],
  ["new", "nav.new"],
  ["my-list", "nav.myList"],
];
export function navbar(route, onProfileChange) {
  const entries = [
    ...routes,
    ["downloads", "downloads.title"],
    ...(activeProfile().role === "admin"
      ? [["operations", "operations.title"]]
      : []),
  ];
  const links = () =>
    entries.map(([path, key]) =>
      el("a", {
        class: "nav-link",
        href: `#/${path}`,
        "aria-current": route === path ? "page" : false,
        text: t(key),
      }),
    );
  const menuButton = button(
    icon("menu"),
    () => {
      menuButton.setAttribute("aria-expanded", "true");
      const current = activeProfile();
      const glyphs = {
        home: "home",
        series: "series",
        movies: "film",
        new: "sparkles",
        "my-list": "list",
        downloads: "download",
        operations: "monitor",
        settings: "settings",
        profiles: "user",
        account: "info",
      };
      const drawerLink = ([path, key]) =>
        el(
          "a",
          {
            class: "drawer-link",
            href: `#/${path}`,
            "aria-current": route === path ? "page" : false,
          },
          [icon(glyphs[path]), el("span", { text: t(key) })],
        );
      const group = (label, items) =>
        el("div", { class: "drawer-group" }, [
          el("p", { class: "drawer-group-label", text: t(label) }),
          ...items.map(drawerLink),
        ]);
      const drawer = openDrawer({
        title: t("nav.menu"),
        content: el(
          "nav",
          { class: "drawer-navigation", "aria-label": t("nav.menu") },
          [
            el("div", { class: "drawer-profile" }, [
              avatar(current),
              el("div", {}, [
                el("strong", { text: current.name }),
                el("small", {
                  text: t(
                    current.role === "admin" ? "profiles.admin" : "nav.profile",
                  ),
                }),
              ]),
            ]),
            group("nav.browse", entries),
            group("nav.accountGroup", [
              ["settings", "nav.settings"],
              ["profiles", "profiles.manage"],
              ["account", "nav.profile"],
            ]),
          ],
        ),
        onClose: () => menuButton.setAttribute("aria-expanded", "false"),
      });
      drawer.id = "navigation-drawer";
      drawer.classList.add("navigation-drawer");
      drawer.addEventListener("click", (event) => {
        if (event.target.closest(".drawer-link")) drawer.close();
      });
      drawer.addEventListener("keydown", (event) => {
        if (!event.target.matches(".drawer-link")) return;
        const items = [...drawer.querySelectorAll(".drawer-link")];
        const index = items.indexOf(event.target);
        const next =
          event.key === "ArrowDown"
            ? (index + 1) % items.length
            : event.key === "ArrowUp"
              ? (index - 1 + items.length) % items.length
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : -1;
        if (next >= 0) {
          event.preventDefault();
          items[next].focus();
        }
      });
    },
    "icon-button menu-toggle",
    {
      "aria-label": t("nav.menu"),
      "aria-expanded": "false",
      "aria-controls": "navigation-drawer",
    },
  );
  const locale = getLocalization();
  return el("div", { class: "container header-inner" }, [
    menuButton,
    el(
      "a",
      { class: "brand", href: "#/home", "aria-label": "Netflix" },
      el("img", {
        class: "brand-wordmark",
        src: "assets/icons/netflix-wordmark.svg",
        alt: "Netflix",
        width: 111,
        height: 30,
      }),
    ),
    el("nav", { class: "desktop-nav", "aria-label": t("nav.menu") }, links()),
    el("div", { class: "header-actions" }, [
      el(
        "a",
        {
          class: "region-chip",
          href: "#/settings",
          "aria-label": t("nav.settings"),
        },
        [
          el("span", { class: "dot" }),
          `${locale.region} / ${locale.language.toUpperCase()}`,
        ],
      ),
      el(
        "a",
        {
          class: "icon-button",
          href: "#/search",
          "aria-label": t("nav.search"),
        },
        icon("search"),
      ),
      button(
        [
          icon("bell"),
          el("span", {
            class: "notification-count",
            text: unreadCount(),
            hidden: unreadCount() === 0,
            "aria-hidden": "true",
          }),
        ],
        openNotifications,
        "icon-button notification-trigger",
        { "aria-label": t("nav.notifications") },
      ),
      profileMenu(onProfileChange),
    ]),
  ]);
}
