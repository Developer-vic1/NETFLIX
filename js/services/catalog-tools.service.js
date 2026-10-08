import {
  profilePreferences,
  saveProfilePreferences,
} from "./profile.service.js";
import { titles } from "../data/titles.js";
import { eventBus } from "./event-bus.service.js";

export function ratingFor(id) {
  const value = profilePreferences().playerPreferences?.ratings?.[id];
  return value === 1 || value === -1 ? value : 0;
}
export function saveRating(id, value) {
  if (!titles.some((title) => title.id === id) || ![-1, 0, 1].includes(value))
    throw new RangeError("Invalid rating");
  const preferences = profilePreferences().playerPreferences || {};
  const saved = saveProfilePreferences({
    playerPreferences: {
      ...preferences,
      ratings: { ...preferences.ratings, [id]: value },
    },
  });
  if (saved) eventBus.emit("TITLE_RATED", `${id} · ${value}`);
  return saved;
}
export function startOver(id) {
  const preferences = profilePreferences().playerPreferences || {};
  return saveProfilePreferences({
    playerPreferences: {
      ...preferences,
      positions: { ...preferences.positions, [id]: 0 },
      progress: { ...preferences.progress, [id]: 0 },
    },
  });
}
export function sortTitles(items, order) {
  const sorted = [...items];
  if (order === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
  if (order === "newest")
    sorted.sort((a, b) => b.year - a.year || a.name.localeCompare(b.name));
  if (order === "shortest") sorted.sort((a, b) => a.duration - b.duration);
  return sorted;
}
export function nextTitle(title) {
  if (title.type === "series" && title.episodes?.length)
    return titles.find((item) => item.id === (title.episodes[1] || title.episodes[0]).id) || title;
  if (title.type === "episode") {
    const siblings = titles.filter((item) => item.seriesId === title.seriesId)
      .sort((a, b) => a.season - b.season || a.number - b.number);
    return siblings[(siblings.findIndex((item) => item.id === title.id) + 1) % siblings.length];
  }
  const collection =
    title.type === "series"
      ? titles.filter((item) => item.type === "series")
      : titles;
  return collection[
    (collection.findIndex((item) => item.id === title.id) + 1) %
      collection.length
  ];
}
