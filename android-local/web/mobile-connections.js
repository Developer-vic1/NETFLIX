import { el, button } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { t } from "../services/localization.service.js";

export function renderConnections({ root, navigate }) {
  let stopped = false;
  let busy = false;
  const title = el("h2", { text: t("connection.checking") });
  const detail = el("p", { class: "muted" });
  const state = el("span", { class: "connection-status", role: "status", "aria-live": "polite" });
  root.append(el("div", { class: "container page connections-page" }, [
    el("header", { class: "page-header" }, [el("div", {}, [
      el("h1", { class: "page-title", text: t("connection.title") }),
      el("p", { class: "muted", text: t("connection.mobileDescription") }),
    ]), button(t("common.back"), () => navigate("home"), "button button-ghost")]),
    el("section", { class: "panel connection-card" }, [
      el("div", { class: "connection-card-heading" }, [icon("monitor"), title]), state, detail,
      el("div", { class: "panel-actions" }, [
        el("a", { class: "button button-primary", href: "netflixlocal://downloads", text: t("connection.mobileNew") }),
        el("a", { class: "button button-ghost", href: "netflixlocal://connection", text: t("connection.mobileShow") }),
      ]),
      el("p", { class: "connection-note", text: t("connection.mobileSaved") }),
    ]),
    el("section", { class: "panel connection-card" }, [
      el("h2", { text: t("connection.mobileQr") }),
      el("p", { class: "muted", text: t("connection.mobileQrHelp") }),
      button(t("connection.library"), () => navigate("downloads"), "button button-ghost"),
    ]),
  ]));
  const draw = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      const response = await fetch("/api/runtime", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (stopped) return;
      const info = data.connection || {};
      title.textContent = info.title || t("connection.title");
      detail.textContent = info.detail || t("connection.mobileDescription");
      state.textContent = t(info.state === "connected" ? "connection.mobileConnected" : info.state === "connecting" ?
        "connection.checking" : info.state === "syncing" ? "connection.mobileReceiving" : "connection.mobileLocal");
      state.dataset.state = info.state === "connected" ? "ready" : "idle";
    } catch {
      if (!stopped) { state.textContent = t("connection.mobileLocal"); state.dataset.state = "idle"; }
    } finally { busy = false; }
  };
  void draw();
  const timer = setInterval(draw, 2000);
  return () => { stopped = true; clearInterval(timer); };
}
