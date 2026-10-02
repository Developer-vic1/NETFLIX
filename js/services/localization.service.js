import { APP_CONFIG } from "../config/app-config.js";
import { LANGUAGES } from "../config/languages.js";
import { REGIONS, getAvailability } from "../config/regions.js";
import { readPreferences, writePreferences } from "./storage.service.js";
import en from "../../locales/en.js";
import es from "../../locales/es.js";
import pt from "../../locales/pt.js";
import fr from "../../locales/fr.js";
import de from "../../locales/de.js";
import it from "../../locales/it.js";
import ja from "../../locales/ja.js";
import ko from "../../locales/ko.js";
import zh from "../../locales/zh.js";
import ar from "../../locales/ar.js";
const dictionaries = { en, es, pt, fr, de, it, ja, ko, zh, ar };
const saved = readPreferences();
let language = LANGUAGES.some((item) => item.code === saved.language)
  ? saved.language
  : APP_CONFIG.defaultLanguage;
let region = REGIONS.some((item) => item.code === saved.region)
  ? saved.region
  : APP_CONFIG.defaultRegion;
export function translate(code, key, params = {}) {
  const local = dictionaries[code]?.[key];
  const english = en[key];
  const value =
    typeof local === "string"
      ? local
      : typeof english === "string"
        ? english
        : String(key);
  return value.replace(/\{(\w+)\}/g, (match, name) => {
    const item = params[name];
    return ["string", "number"].includes(typeof item) ? String(item) : match;
  });
}
export const t = (key, params) => translate(language, key, params);
export function getLocalization() {
  return {
    language,
    region,
    direction: LANGUAGES.find((item) => item.code === language).direction,
    availability: getAvailability(region, language),
  };
}
export function applyDocumentLocale() {
  const locale = getLocalization();
  document.documentElement.lang = locale.language;
  document.documentElement.dir = locale.direction;
}
export function setLocalization(nextLanguage, nextRegion) {
  if (
    !LANGUAGES.some((item) => item.code === nextLanguage) ||
    !REGIONS.some((item) => item.code === nextRegion)
  )
    throw new RangeError("Unsupported language or region");
  language = nextLanguage;
  region = nextRegion;
  applyDocumentLocale();
  return writePreferences({ ...readPreferences(), language, region });
}
applyDocumentLocale();
