import { getLocalization } from "../services/localization.service.js";
export function number(value, digits = 1) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(getLocalization().language, {
    maximumFractionDigits: digits,
  }).format(value);
}
export function dateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(getLocalization().language, {
        dateStyle: "short",
        timeStyle: "medium",
      }).format(date);
}
export function seconds(value) {
  return Number.isFinite(value) ? `${number(value)} s` : "—";
}
export function milliseconds(value) {
  return Number.isFinite(value) ? `${number(value)} ms` : "—";
}
export function megabytes(value) {
  return Number.isFinite(value) ? `${number(value / 1048576)} MB` : "—";
}
