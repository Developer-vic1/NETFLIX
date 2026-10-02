const secondsOf = (value) =>
  Number.isFinite(value) ? Math.floor(Math.max(0, value)) : 0;

export function formatTime(value) {
  const seconds = secondsOf(value);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const tail = `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return hours ? `${hours}:${tail}` : tail;
}

export function formatDuration(value, locale = "es") {
  const minutes = Math.floor(secondsOf(value) / 60);
  const hours = Math.floor(minutes / 60);
  const unit = (amount, name) =>
    new Intl.NumberFormat(locale, {
      style: "unit",
      unit: name,
      unitDisplay: "short",
    }).format(amount);
  return hours
    ? `${unit(hours, "hour")}${minutes % 60 ? ` ${unit(minutes % 60, "minute")}` : ""}`
    : unit(minutes, "minute");
}
