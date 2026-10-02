import { t } from "../services/localization.service.js";
import { titles } from "../data/titles.js";
import { getProfiles } from "../services/profile.service.js";
const groups = {
  playback: [
    "PLAY_STARTED",
    "PLAY_PAUSED",
    "PLAY_ENDED",
    "BUFFERING_STARTED",
    "QUALITY_CHANGED",
    "PLAYBACK_SPEED_CHANGED",
    "PLAY_ERROR",
  ],
  downloads: ["DOWNLOAD_COMPLETED", "DOWNLOAD_FAILED", "DOWNLOAD_REMOVED"],
  account: [
    "PROFILE_CHANGED",
    "LOCALIZATION_CHANGED",
    "MY_LIST_CHANGED",
    "TITLE_RATED",
    "HOME_LOADED",
  ],
};
export function activityInfo(item) {
  const group =
    Object.entries(groups).find(([, names]) =>
      names.includes(item.name),
    )?.[0] || "system";
  const key = `activity.${item.name}`;
  const label = t(key) === key ? t("activity.generic") : t(key);
  const title = titles.find((entry) => String(item.details).includes(entry.id));
  const profile = getProfiles().find(
    (entry) =>
      entry.id === item.profileId ||
      (item.name === "PROFILE_CHANGED" && entry.id === item.details),
  );
  let context = [title?.name, profile?.name].filter(Boolean).join(" · ");
  if (item.name === "OPERATIONS_SECTION_OPENED")
    context = t(
      {
        overview: "ops.overview",
        sessions: "ops.sessions",
        incidents: "ops.incidents",
        services: "admin.integrations",
        library: "library.title",
        events: "operations.events",
      }[item.details] || "operations.title",
    );
  if (item.name === "WORKSPACE_UPDATED")
    context = t(
      {
        curation: "workspace.curation",
        customers: "workspace.customers",
        invoices: "workspace.invoices",
        regions: "workspace.capacity",
        import: "workspace.import",
      }[item.details] || "workspace.title",
    );
  return {
    group,
    label,
    context: context || t(`activity.${group}`),
    warning: /FAILED|BUFFERING|ERROR/.test(item.name),
  };
}
