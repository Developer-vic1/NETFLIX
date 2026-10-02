import { eventBus } from "./event-bus.service.js";
import {
  profilePreferences,
  saveProfilePreferences,
  activeProfile,
  getProfiles,
} from "./profile.service.js";
import { titles } from "../data/titles.js";
export function notifications(id = activeProfile().id) {
  return (profilePreferences(id).notifications || [])
    .filter(
      (item) =>
        item && typeof item.id === "string" && typeof item.kind === "string",
    )
    .slice(-30);
}
export function unreadCount() {
  return notifications().filter((item) => !item.read).length;
}
const announce = () => window.dispatchEvent(new Event("notifications-changed"));
export function markNotificationsRead() {
  saveProfilePreferences({
    notifications: notifications().map((item) => ({ ...item, read: true })),
  });
  announce();
}
export function clearNotifications() {
  saveProfilePreferences({ notifications: [] });
  announce();
}
export function startNotifications() {
  return eventBus.subscribe((event) => {
    const profileId = event.profileId || activeProfile().id;
    if (
      !getProfiles().some((profile) => profile.id === profileId) ||
      profilePreferences(profileId).playerPreferences?.notifications === false
    )
      return;
    const types = {
      PLAY_STARTED: "play",
      DOWNLOAD_COMPLETED: "download",
      DOWNLOAD_FAILED: "failed",
      MY_LIST_CHANGED: event.details.endsWith("added") ? "added" : "removed",
    };
    const kind = types[event.name];
    if (!kind) return;
    const titleId = event.details.split(/[ ·]/)[0];
    if (!titles.some((title) => title.id === titleId)) return;
    saveProfilePreferences(
      {
        notifications: [
          ...notifications(profileId),
          {
            id: crypto.randomUUID(),
            kind,
            titleId,
            time: new Date().toISOString(),
            read: false,
          },
        ].slice(-30),
      },
      profileId,
    );
    announce();
  });
}
