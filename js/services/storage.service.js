import { APP_CONFIG } from "../config/app-config.js";
export function readPreferences() {
  try {
    const data = JSON.parse(
      localStorage.getItem(APP_CONFIG.storageKey) || "{}",
    );
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}
export function writePreferences(preferences) {
  // Allowlist: no credentials, payment details, or private tokens.
  const allowed = [
    "language",
    "region",
    "theme",
    "selectedProfile",
    "myList",
    "playerPreferences",
    "profiles",
    "profileData",
  ];
  const data = Object.fromEntries(
    allowed
      .filter((key) => Object.hasOwn(preferences, key))
      .map((key) => [key, preferences[key]]),
  );
  try {
    localStorage.setItem(APP_CONFIG.storageKey, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
