import { saveProfilePreferences, activeProfile } from "./profile.service.js";
import { readPreferences } from "./storage.service.js";
export function recordProgress(
  titleId,
  currentTime,
  duration,
  profileId = activeProfile().id,
) {
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !Number.isFinite(currentTime)
  )
    return;
  const saved = readPreferences();
  const preferences =
    saved.profileData?.[profileId]?.playerPreferences ||
    (profileId === "victor" ? saved.playerPreferences : {}) ||
    {};
  const progress = Math.min(100, Math.max(0, (currentTime / duration) * 100));
  saveProfilePreferences(
    {
      playerPreferences: {
        ...preferences,
        progress: { ...preferences.progress, [titleId]: progress },
        positions: { ...preferences.positions, [titleId]: currentTime },
      },
    },
    profileId,
  );
}
