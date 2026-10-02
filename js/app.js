import { el, button } from "./utils/dom.js";
import { t, getLocalization } from "./services/localization.service.js";
import {
  readPreferences,
  writePreferences,
} from "./services/storage.service.js";
import { eventBus } from "./services/event-bus.service.js";
import { titles } from "./data/titles.js";
import { loadLibrary } from "./services/library.service.js";
import { navbar } from "./components/navbar.js";
import { toast, clearToasts } from "./components/toast.js";
import { closeModal } from "./components/modal.js";
import { stateView } from "./components/state.js";
import { renderHome } from "./pages/home.js";
import { renderSettings } from "./pages/settings.js";
import { renderAccount } from "./pages/account.js";
import { renderPlayer } from "./pages/player.js";
import { renderOperations } from "./pages/operations.js";
import { renderProfiles } from "./pages/profiles.js";
import {
  activeProfile,
  profilePreferences,
  saveProfilePreferences,
} from "./services/profile.service.js";
import { renderDownloads } from "./pages/downloads.js";
import { renderTitle } from "./pages/title.js";
import { showIntro, closeIntro } from "./components/intro.js";
import {
  startNotifications,
  unreadCount,
} from "./services/notification.service.js";
import { changeView, revealContent } from "./services/motion.service.js";
import { recordOperationEvent } from "./services/operations-store.service.js";
const root = document.getElementById("app");
const stopNotifications = startNotifications();
const stopJournal = eventBus.subscribe((event) => {
  const titleId = event.details.split(/[ ·]/)[0];
  recordOperationEvent({
    ...event,
    region: getLocalization().region,
    profileId: event.profileId || activeProfile().id,
    ...(titles.some((title) => title.id === titleId) ? { titleId } : {}),
  });
});
let cleanup = () => {};
const navigate = (route) => {
  location.hash = `/${route}`;
};
function render() {
  cleanup();
  cleanup = () => {};
  closeModal();
  clearToasts();
  const route = location.hash.replace(/^#\/?/, "").split("?")[0] || "home";
  root.dataset.route = route;
  document.documentElement.classList.toggle(
    "reduce-motion",
    profilePreferences().playerPreferences?.reducedMotion === true,
  );
  const storedList = profilePreferences().myList;
  const myList = new Set(
    Array.isArray(storedList)
      ? storedList.filter((id) => titles.some((title) => title.id === id))
      : [],
  );
  document.getElementById("header").replaceChildren(
    navbar(route, (profile) => {
      const target = profile.role === "admin" ? "operations" : "home";
      if (location.hash === `#/${target}`) render();
      else navigate(target);
    }),
  );
  document.getElementById("skip-link").textContent = t("common.skip");
  document
    .getElementById("footer")
    .replaceChildren(
      el("div", { class: "container footer-inner" }, [
        el("div", {}, [
          el("p", { text: "Netflix" }),
          button(t("intro.replay"), () => showIntro(true), "text-link"),
        ]),
        el("nav", { class: "footer-links", "aria-label": t("nav.settings") }, [
          el("a", { href: "#/settings", text: t("nav.settings") }),
          el("a", { href: "#/profiles", text: t("profiles.manage") }),
          el("a", { href: "#/downloads", text: t("downloads.title") }),
          activeProfile().role === "admin"
            ? el("a", { href: "#/operations", text: t("nav.operations") })
            : null,
        ]),
      ]),
    );
  root.replaceChildren();
  root.classList.remove("view-enter");
  void root.offsetWidth;
  root.classList.add("view-enter");
  const context = {
    root,
    route,
    navigate,
    refresh: render,
    inList: (id) => myList.has(id),
    toggleList(id) {
      const added = !myList.has(id);
      if (added) myList.add(id);
      else myList.delete(id);
      const stored = saveProfilePreferences({ myList: [...myList] });
      eventBus.emit("MY_LIST_CHANGED", `${id} ${added ? "added" : "removed"}`);
      // Refresh list views after the button event finishes, so every duplicate card stays synchronized.
      const notify = () =>
        toast(
          t(
            stored
              ? added
                ? "title.added"
                : "title.removed"
              : "common.storageError",
          ),
          stored ? "success" : "warning",
        );
      if (route === "my-list" || route === "home")
        queueMicrotask(() => {
          const y = scrollY;
          render();
          scrollTo({ top: y, behavior: "instant" });
          (root.querySelector(`[data-list-id="${id}"]`) || root).focus({
            preventScroll: true,
          });
          notify();
        });
      else notify();
      return added;
    },
  };
  try {
    const renderers = {
      home: renderHome,
      series: renderHome,
      movies: renderHome,
      new: renderHome,
      "my-list": renderHome,
      search: renderHome,
      settings: renderSettings,
      account: renderAccount,
      profiles: renderProfiles,
      downloads: renderDownloads,
      player: renderPlayer,
      operations: renderOperations,
      title: renderTitle,
    };
    if (!renderers[route]) {
      root.append(
        el(
          "div",
          { class: "container page" },
          stateView("error", t("common.noResults"), () => navigate("home")),
        ),
      );
    } else cleanup = renderers[route](context) || (() => {});
  } catch (error) {
    console.error("Interface render failed", error);
    root.replaceChildren(
      el(
        "div",
        { class: "container page" },
        stateView("error", t("common.error"), () => location.reload()),
      ),
    );
  }
  const destroyPage = cleanup,
    destroyReveal = revealContent(root);
  cleanup = () => {
    destroyReveal();
    destroyPage();
  };
  const network = document.getElementById("network-status");
  network.hidden = navigator.onLine;
  network.textContent = t("common.offline");
  document.title = `Netflix · ${t({ settings: "nav.settings", account: "account.title", player: "player.title", operations: "operations.title", series: "nav.series", movies: "nav.movies", new: "nav.new", "my-list": "nav.myList", search: "nav.search" }[route] || "nav.home")}`;
  if (route === "home")
    eventBus.emit(
      "HOME_LOADED",
      `${getLocalization().region}/${getLocalization().language}`,
    );
}
document.documentElement.classList.toggle(
  "reduce-motion",
  readPreferences().playerPreferences?.reducedMotion === true,
);
document.getElementById("skip-link").addEventListener("click", (event) => {
  event.preventDefault();
  root.focus();
  root.scrollIntoView({ behavior: "auto" });
});
window.addEventListener("hashchange", () =>
  changeView(() => {
    render();
    scrollTo({ top: 0, behavior: "instant" });
    if (!location.hash.includes("search")) root.focus({ preventScroll: true });
  }),
);
window.addEventListener("offline", () => {
  document.getElementById("network-status").hidden = false;
});
window.addEventListener("online", () => {
  document.getElementById("network-status").hidden = true;
});
window.addEventListener("notifications-changed", () => {
  const count = document.querySelector(".notification-count");
  if (count) {
    count.textContent = unreadCount();
    count.hidden = unreadCount() === 0;
  }
});
window.addEventListener("pagehide", () => {
  cleanup();
  closeModal();
  clearToasts();
  closeIntro();
  stopNotifications();
  stopJournal();
});
await loadLibrary().catch(() => eventBus.emit("LIBRARY_LOAD_FAILED"));
render();
if (!location.hash || /^#\/?home(?:\?|$)/.test(location.hash))
  showIntro(true, 3600);
// Prepare offline files after the opening, without competing with the first view.
if ("serviceWorker" in navigator) {
  const prepareOffline = () =>
    navigator.serviceWorker
      .register("/sw.js")
      .catch(() => eventBus.emit("OFFLINE_SETUP_FAILED"));
  setTimeout(() => {
    if ("requestIdleCallback" in window)
      requestIdleCallback(prepareOffline, { timeout: 2000 });
    else prepareOffline();
  }, 3800);
}
