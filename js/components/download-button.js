import { button } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { t } from "../services/localization.service.js";
import { downloadTitle } from "../services/download.service.js";
import { toast } from "./toast.js";
export function downloadButton(title, navigate) {
  if (title.uploaded)
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
