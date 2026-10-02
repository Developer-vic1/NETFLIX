export const REGION_GROUPS = Object.freeze([
  "LATAM",
  "NORTH_AMERICA",
  "EUROPE",
  "ASIA_PACIFIC",
  "AFRICA",
  "MIDDLE_EAST",
]);
export const REGIONS = Object.freeze(
  [
    ["BO", "Bolivia", "LATAM"],
    ["MX", "México", "LATAM"],
    ["AR", "Argentina", "LATAM"],
    ["CL", "Chile", "LATAM"],
    ["CO", "Colombia", "LATAM"],
    ["PE", "Perú", "LATAM"],
    ["BR", "Brasil", "LATAM"],
    ["US", "Estados Unidos", "NORTH_AMERICA"],
    ["CA", "Canadá", "NORTH_AMERICA"],
    ["ES", "España", "EUROPE"],
    ["GB", "Reino Unido", "EUROPE"],
    ["FR", "Francia", "EUROPE"],
    ["DE", "Alemania", "EUROPE"],
    ["IT", "Italia", "EUROPE"],
    ["JP", "Japón", "ASIA_PACIFIC"],
    ["KR", "Corea del Sur", "ASIA_PACIFIC"],
    ["CN", "China", "ASIA_PACIFIC"],
    ["IN", "India", "ASIA_PACIFIC"],
    ["AU", "Australia", "ASIA_PACIFIC"],
    ["ZA", "Sudáfrica", "AFRICA"],
    ["EG", "Egipto", "AFRICA"],
    ["AE", "Emiratos Árabes Unidos", "MIDDLE_EAST"],
    ["SA", "Arabia Saudita", "MIDDLE_EAST"],
  ].map(([code, name, group]) => Object.freeze({ code, name, group })),
);
export const AVAILABILITY_STATES = Object.freeze([
  "SUPPORTED",
  "PARTIAL",
  "UNAVAILABLE",
]);
export function regionName(code, language = "es") {
  try {
    return (
      new Intl.DisplayNames([language], { type: "region" }).of(code) || code
    );
  } catch {
    return REGIONS.find((region) => region.code === code)?.name || code;
  }
}
// Interface translation coverage only. Region never changes media licensing or tracks.
export function getAvailability(region, language) {
  if (
    !REGIONS.some((item) => item.code === region) ||
    !["es", "en", "pt", "fr", "de", "it", "ja", "ko", "zh", "ar"].includes(
      language,
    )
  )
    return "UNAVAILABLE";
  return ["es", "en", "it", "ar"].includes(language) ? "SUPPORTED" : "PARTIAL";
}
