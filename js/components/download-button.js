import { button } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { t } from "../services/localization.service.js";
import { downloadTitle } from "../services/download.service.js";
import { toast } from "./toast.js";
import { titles } from "../data/titles.js";
export function downloadButton(title, navigate) {
  if (title.episodes?.length)
    return button(
      icon("download"),
      () => {
        void (async () => {
          for (const episode of title.episodes) {
            const item = titles.find((entry) => entry.id === episode.id);
            if (item) await downloadTitle(item);
          }
        })().catch(() => toast(t("downloads.unsupported"), "warning"));
        navigate("downloads");
      },
      "icon-button",
      { "aria-label": `${t("downloads.save")} · ${title.name}` },
    );
  if (title.uploaded && title.localAsset?.startsWith("blob:"))
    return button(
      icon("check"),
      () => navigate(`player?title=${title.id}`),
      "icon-button",
      { "aria-label": `${t("library.offline")} · ${title.name}` },
    );
  return button(
    icon("download"),
    () => {
      void downloadTitle(title).catch(() =>
        toast(t("downloads.unsupported"), "warning"),
      );
      navigate("downloads");
    },
    "icon-button",
    { "aria-label": `${t("downloads.save")} · ${title.name}` },
  );
}
