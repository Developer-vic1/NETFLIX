import { profiles as defaults } from "../data/profiles.js";
import { readPreferences, writePreferences } from "./storage.service.js";
import { eventBus } from "./event-bus.service.js";
export const PROFILE_COLORS = [
  "blue",
  "purple",
  "red",
  "teal",
  "amber",
  "pink",
  "cyan",
  "slate",
];
export function getProfiles() {
  const saved = readPreferences().profiles;
  const valid = Array.isArray(saved)
    ? saved
        .filter(
          (item) =>
            item &&
            typeof item.id === "string" &&
            typeof item.name === "string" &&
            item.name.trim() &&
            ["viewer", "admin"].includes(item.role),
        )
        .slice(0, 8)
    : [];
  const used = new Set();
  return (valid.some((item) => item.role === "admin") ? valid : defaults).map(
    (item) => {
      const color =
        PROFILE_COLORS.includes(item.color) && !used.has(item.color)
          ? item.color
          : PROFILE_COLORS.find((value) => !used.has(value));
      used.add(color);
      return { ...item, color };
    },
  );
}
export function activeProfile() {
  const profiles = getProfiles();
  return (
    profiles.find((item) => item.id === readPreferences().selectedProfile) ||
    profiles[0]
  );
}
export function profilePreferences(id = activeProfile().id) {
  const saved = readPreferences();
  return (
    saved.profileData?.[id] ||
    (id === "victor"
      ? {
          myList: saved.myList || [],
          playerPreferences: saved.playerPreferences || {},
        }
      : { myList: [], playerPreferences: {} })
  );
}
export function saveProfilePreferences(changes, id = activeProfile().id) {
  const saved = readPreferences();
  const previous =
    saved.profileData?.[id] ||
    (id === "victor"
      ? {
          myList: saved.myList || [],
          playerPreferences: saved.playerPreferences || {},
        }
      : {});
  return writePreferences({
    ...saved,
    profileData: { ...saved.profileData, [id]: { ...previous, ...changes } },
  });
}
export function switchProfile(id) {
  if (!getProfiles().some((item) => item.id === id))
    throw new RangeError("Unknown profile");
  const stored = writePreferences({
    ...readPreferences(),
    selectedProfile: id,
  });
  if (!stored) throw new Error("Profile storage unavailable");
  eventBus.emit("PROFILE_CHANGED", id);
}
export function saveProfile(id, name, color = "blue") {
  const cleaned = String(name).trim();
  if (!cleaned || cleaned.length > 24 || !PROFILE_COLORS.includes(color))
    throw new RangeError("Invalid profile");
  const profiles = getProfiles();
  if (profiles.some((item) => item.id !== id && item.color === color))
    throw new RangeError("Color unavailable");
  if (!id && profiles.length >= 8) throw new RangeError("Profile limit");
  const current = profiles.find((item) => item.id === id);
  const next = current
    ? profiles.map((item) =>
        item.id === id ? { ...item, name: cleaned, color } : item,
      )
    : [
        ...profiles,
        { id: crypto.randomUUID(), name: cleaned, color, role: "viewer" },
      ];
  if (!writePreferences({ ...readPreferences(), profiles: next }))
    throw new Error("Profile storage unavailable");
}
export function deleteProfile(id) {
  const profiles = getProfiles(),
    target = profiles.find((item) => item.id === id);
  if (
    !target ||
    target.role === "admin" ||
    profiles.filter((item) => item.role === "viewer").length <= 1
  )
    return false;
  const saved = readPreferences(),
    data = { ...saved.profileData };
  delete data[id];
  return writePreferences({
    ...saved,
    profiles: profiles.filter((item) => item.id !== id),
    profileData: data,
    selectedProfile:
      saved.selectedProfile === id
        ? profiles.find((item) => item.id !== id).id
        : saved.selectedProfile,
  });
}
