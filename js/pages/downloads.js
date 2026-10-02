import { el, button } from "../utils/dom.js";
import { t } from "../services/localization.service.js";
import { titles } from "../data/titles.js";
import {
  downloadState,
  downloadedTitles,
  downloadTitle,
  cancelDownload,
  removeDownload,
  subscribeDownloads,
  offlineSource,
} from "../services/download.service.js";
import { toast } from "../components/toast.js";
export function renderDownloads({ root, navigate }) {
  let disposed = false,
    ready = new Set();
  const grid = el("div", { class: "download-grid" });
  const storage = el("p", { class: "muted", role: "status" });
  const cards = new Map();
  const act = (action) => {
    void action().catch(() => toast(t("downloads.error"), "error"));
  };
  for (const title of titles) {
    const status = el("p", { class: "muted", role: "status" });
    const progress = el("progress", {
      max: 100,
      value: 0,
      "aria-label": `${t("downloads.progress")} · ${title.name}`,
    });
    const actions = el("div", { class: "panel-actions" });
    const card = el(
      "article",
      { class: "panel download-card", "data-download-id": title.id },
      [
        el("img", {
          src: title.poster,
          alt: "",
          loading: "lazy",
          width: 640,
          height: 360,
        }),
        el("h2", { text: title.name }),
        el("p", {
          class: "muted",
          text: `${offlineSource(title).quality} · ${Math.round(offlineSource(title).bytes / 1048576)} MB`,
        }),
        status,
        progress,
        actions,
      ],
    );
    cards.set(title.id, { status, progress, actions, state: "" });
    grid.append(card);
  }
  const draw = () => {
    if (disposed) return;
    for (const title of titles) {
      const job = downloadState(title.id),
        node = cards.get(title.id),
        state =
          (title.uploaded || ready.has(title.id)) && job.state !== "downloading"
            ? "ready"
            : job.state;
      node.progress.hidden = state !== "downloading";
      node.progress.value = job.percent || 0;
      node.status.textContent =
        state === "downloading"
          ? t("downloads.downloading", { percent: job.percent })
          : t(
              state === "ready"
                ? "downloads.ready"
                : state === "error"
                  ? job.error || "downloads.error"
                  : "downloads.available",
            );
      if (node.state === state) continue;
      node.state = state;
      node.actions.replaceChildren(
        ...(state === "downloading"
          ? [button(t("downloads.cancel"), () => cancelDownload(title.id))]
          : state === "ready"
            ? [
                button(
                  t("title.play"),
                  () => navigate(`player?title=${title.id}&offline=1`),
                  "button button-light",
                ),
                !title.uploaded
                  ? button(t("downloads.remove"), () =>
                      act(async () => {
                        await removeDownload(title);
                        ready.delete(title.id);
                        draw();
                      }),
                    )
                  : el("span", { class: "muted", text: t("library.offline") }),
              ]
            : [
                button(
                  t("downloads.save"),
                  () => act(() => downloadTitle(title)),
                  "button button-primary",
                  { disabled: !navigator.onLine },
                ),
              ]),
      );
    }
  };
  const refresh = async () => {
    ready = new Set((await downloadedTitles()).map((title) => title.id));
    draw();
    const estimate = await navigator.storage?.estimate?.();
    if (!disposed && estimate)
      storage.textContent = t("downloads.storage", {
        used: Math.round(estimate.usage / 1048576),
        free: Math.floor((estimate.quota - estimate.usage) / 1048576),
      });
  };
  const unsubscribe = subscribeDownloads(draw);
  const onlineChanged = () => {
    for (const node of cards.values()) node.state = "";
    draw();
  };
  window.addEventListener("online", onlineChanged);
  window.addEventListener("offline", onlineChanged);
  root.append(
    el("div", { class: "container page" }, [
      el("div", { class: "page-header" }, [
        el("div", {}, [
          el("h1", { class: "page-title", text: t("downloads.title") }),
          el("p", { class: "muted", text: t("downloads.subtitle") }),
          storage,
        ]),
        button(t("common.back"), () => navigate("home"), "button button-ghost"),
      ]),
      el("p", { class: "notice", text: t("downloads.device") }),
      grid,
    ]),
  );
  draw();
  void refresh().catch(() => {
    if (!disposed) storage.textContent = t("downloads.unsupported");
  });
  return () => {
    disposed = true;
    unsubscribe();
    window.removeEventListener("online", onlineChanged);
    window.removeEventListener("offline", onlineChanged);
  };
}
