import { el, button, field, select } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { t } from "../services/localization.service.js";
import { toast } from "../components/toast.js";
import { enhanceSelects } from "../components/custom-select.js";

// Every connection state comes from the local coordinator; opening a wizard
// does not imply that the phone is installed, paired, or finished transferring.
export function renderConnections({ root, navigate }) {
  let disposed = false;
  let pending = false;
  let controller;
  let snapshot;
  let addressSignature = "";
  let selectedAddress = "";
  let selectCleanup;
  let renderedQr = "";
  const live = el("p", { class: "connection-feedback", role: "status", "aria-live": "polite" });
  const usbBadge = el("span", { class: "connection-status", text: t("connection.checking") });
  const wifiBadge = el("span", { class: "connection-status", text: t("connection.checking") });
  const devices = el("ul", { class: "connection-devices", "aria-label": t("connection.usbTitle") });
  const apk = el("p", { class: "muted" });
  const usbHelp = el("p", { class: "muted", text: t("connection.usbHelp") });
  const wifiHelp = el("p", { class: "muted", text: t("connection.wifiHelp") });
  const network = el("div", { class: "connection-network" });
  const qrImage = el("img", { class: "connection-qr-image", alt: t("connection.qrTitle"), width: 240, height: 240 });
  const addressText = el("code", { class: "connection-address", dir: "ltr" });
  const code = el("strong", { class: "connection-code", dir: "ltr" });
  const copyButton = button(t("connection.copy"), () => copyConnection(), "button button-ghost");
  const qr = el("section", { class: "connection-pairing", hidden: true }, [
    el("div", { class: "connection-qr" }, [qrImage]),
    el("div", { class: "connection-pairing-copy" }, [
      el("h3", { text: t("connection.qrTitle") }),
      el("p", { class: "muted", text: t("connection.qrHelp") }),
      network,
      addressText,
      el("div", { class: "connection-code-row" }, [el("span", { text: t("connection.code") }), code]),
      copyButton,
    ]),
  ]);
  const refreshButton = button([icon("settings"), t("connection.refresh")], () => update(), "button button-ghost");
  const usbButton = button([icon("download"), t("connection.usbTitle")], () => launch("start_usb"), "button button-light");
  const wifiButton = button([icon("globe"), t("connection.wifiTitle")], () => launch("start_wifi"), "button button-primary");
  const page = el("div", { class: "container page connections-page" }, [
    el("header", { class: "page-header" }, [
      el("div", {}, [el("h1", { class: "page-title", text: t("connection.title") }), el("p", { class: "muted", text: t("connection.subtitle") })]),
      button(t("common.back"), () => navigate("home"), "button button-ghost"),
    ]),
    el("div", { class: "connection-toolbar" }, [live, refreshButton]),
    el("div", { class: "connection-grid" }, [
      card("monitor", "connection.usbTitle", "connection.usbDescription", [usbBadge, devices, usbHelp, apk, usbButton, el("p", { class: "connection-note", text: t("connection.usbNotice") })]),
      card("globe", "connection.wifiTitle", "connection.wifiDescription", [wifiBadge, wifiHelp, wifiButton]),
    ]),
    qr,
    el("footer", { class: "connection-footer" }, [icon("check"), el("p", { text: t("connection.privacy") }), button(t("connection.library"), () => navigate("series"), "button button-ghost")]),
  ]);
  root.append(page);

  function card(symbol, titleKey, descriptionKey, children) {
    return el("section", { class: "panel connection-card" }, [
      el("div", { class: "connection-card-heading" }, [el("span", { class: "connection-card-icon" }, [icon(symbol)]), el("h2", { text: t(titleKey) })]),
      el("p", { class: "muted", text: t(descriptionKey) }),
      ...children,
    ]);
  }

  function badge(node, text, state = "idle") {
    node.textContent = text;
    node.dataset.state = state;
  }

  function draw(data) {
    snapshot = data;
    const detected = Array.isArray(data.devices) ? data.devices : [];
    badge(usbBadge, t(detected.length ? "connection.usbDetected" : "connection.usbNone"), detected.some((item) => item.state === "device") ? "ready" : "idle");
    devices.replaceChildren(...detected.map((item) => el("li", { class: "connection-device" }, [
      icon("monitor"),
      el("div", {}, [el("strong", { text: item.model || item.serial }), el("span", { class: "muted", text: t(item.state === "device" ? "connection.usbReady" : item.state === "unauthorized" ? "connection.usbUnauthorized" : "connection.usbOffline") })]),
      el("code", { dir: "ltr", text: item.serial }),
    ])));
    usbHelp.hidden = detected.some((item) => item.state === "device");
    apk.textContent = t(data.apk?.exists ? "connection.apkReady" : "connection.apkMissing", { version: data.apk?.version || "—" });
    usbButton.disabled = !data.apk?.exists || pending;
    const active = data.wifi?.running === true;
    badge(wifiBadge, t(active ? "connection.wifiActive" : "connection.wifiInactive"), active ? "ready" : "idle");
    wifiHelp.hidden = active;
    wifiButton.hidden = active;
    const addresses = active && Array.isArray(data.wifi.addresses) ? data.wifi.addresses.filter((value) => /^http:\/\/\d{1,3}(?:\.\d{1,3}){3}:4184$/.test(value)) : [];
    const signature = addresses.join("|");
    if (signature !== addressSignature) {
      addressSignature = signature;
      selectCleanup?.();
      if (!addresses.includes(selectedAddress)) selectedAddress = addresses[0] || "";
      network.replaceChildren();
      if (addresses.length > 1) {
        const input = select(addresses.map((address) => [address, address]), selectedAddress, { "aria-label": t("connection.network"), dir: "ltr" });
        input.addEventListener("change", () => { selectedAddress = input.value; drawQr(); });
        network.append(field(t("connection.network"), input));
        selectCleanup = enhanceSelects(network);
      }
    }
    drawQr();
  }

  function drawQr() {
    const current = snapshot?.wifi?.qrs?.find((item) => item.address === selectedAddress);
    const svg = current?.svg;
    const valid = snapshot?.wifi?.running === true && typeof svg === "string" && svg.length < 131072 && /^\s*<svg[\s>]/.test(svg) && /^\d{6}$/.test(snapshot.wifi.code || "");
    qr.hidden = !valid;
    if (!valid) { qrImage.removeAttribute("src"); renderedQr = ""; return; }
    if (renderedQr !== svg) {
      // SVG is displayed as an image, never inserted into the document DOM.
      const bytes = new TextEncoder().encode(svg);
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      qrImage.src = "data:image/svg+xml;base64," + btoa(binary);
      renderedQr = svg;
    }
    addressText.textContent = selectedAddress;
    code.textContent = snapshot.wifi.code;
  }

  async function copyConnection() {
    const current = snapshot?.wifi?.qrs?.find((item) => item.address === selectedAddress);
    if (qr.hidden || !current?.payload) return;
    try { await navigator.clipboard.writeText(current.payload); if (!disposed) toast(t("connection.copied")); }
    catch { if (!disposed) toast(t("connection.copyError"), "error"); }
  }

  async function request(action) {
    controller = new AbortController();
    const timer = setTimeout(() => controller?.abort(), 12000);
    try {
      const response = await fetch("/api/connections", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }), signal: controller.signal, cache: "no-store",
      });
      if (!response.ok) throw new Error("Connection request failed");
      const data = await response.json();
      if (!data || !Array.isArray(data.devices) || typeof data.wifi?.running !== "boolean") throw new Error("Invalid connection response");
      return data;
    } finally { clearTimeout(timer); }
  }

  async function update(action = "status", quiet = false) {
    if (disposed || pending) return;
    pending = true;
    page.setAttribute("aria-busy", "true");
    page.classList.add("is-checking");
    refreshButton.disabled = usbButton.disabled = wifiButton.disabled = true;
    if (!quiet) { live.textContent = t("connection.checking"); live.dataset.state = "loading"; }
    try {
      const data = await request(action);
      if (disposed) return;
      draw(data);
      if (!quiet) {
        live.textContent = t(action === "start_wifi" && data.starting ? "connection.wifiStart" : action === "start_usb" ? "connection.wizard" : "connection.updated");
        live.dataset.state = action === "start_wifi" && data.starting ? "starting" : "ready";
      } else if (live.dataset.state === "error" || (live.dataset.state === "starting" && data.wifi.running)) {
        live.textContent = t("connection.updated"); live.dataset.state = "ready";
      }
    } catch {
      if (disposed) return;
      snapshot = undefined;
      qr.hidden = true;
      badge(wifiBadge, t("connection.wifiUnknown"));
      badge(usbBadge, t("connection.wifiUnknown"));
      devices.replaceChildren();
      apk.textContent = "";
      wifiButton.hidden = false;
      wifiHelp.hidden = false;
      usbHelp.hidden = false;
      live.textContent = t("connection.error"); live.dataset.state = "error";
    } finally {
      pending = false;
      if (!disposed) {
        page.setAttribute("aria-busy", "false"); page.classList.remove("is-checking");
        refreshButton.disabled = wifiButton.disabled = false;
        usbButton.disabled = !snapshot?.apk?.exists;
      }
    }
  }

  function launch(action) { void update(action); }
  void update();
  const interval = setInterval(() => { if (!document.hidden) void update("status", true); }, 10000);
  const visible = () => { if (!document.hidden) void update("status", true); };
  document.addEventListener("visibilitychange", visible);
  return () => { disposed = true; clearInterval(interval); controller?.abort(); selectCleanup?.(); document.removeEventListener("visibilitychange", visible); };
}
