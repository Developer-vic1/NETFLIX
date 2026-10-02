export const REGION_GROUPS = Object.freeze(['LATAM', 'NORTH_AMERICA', 'EUROPE', 'ASIA_PACIFIC', 'AFRICA', 'MIDDLE_EAST']);
export const REGIONS = Object.freeze([
  ['BO', 'Bolivia', 'LATAM'], ['MX', 'México', 'LATAM'], ['AR', 'Argentina', 'LATAM'], ['CL', 'Chile', 'LATAM'], ['CO', 'Colombia', 'LATAM'], ['PE', 'Perú', 'LATAM'], ['BR', 'Brasil', 'LATAM'],
  ['US', 'Estados Unidos', 'NORTH_AMERICA'], ['CA', 'Canadá', 'NORTH_AMERICA'],
  ['ES', 'España', 'EUROPE'], ['GB', 'Reino Unido', 'EUROPE'], ['FR', 'Francia', 'EUROPE'], ['DE', 'Alemania', 'EUROPE'], ['IT', 'Italia', 'EUROPE'],
  ['JP', 'Japón', 'ASIA_PACIFIC'], ['KR', 'Corea del Sur', 'ASIA_PACIFIC'], ['CN', 'China', 'ASIA_PACIFIC'], ['IN', 'India', 'ASIA_PACIFIC'], ['AU', 'Australia', 'ASIA_PACIFIC'],
  ['ZA', 'Sudáfrica', 'AFRICA'], ['EG', 'Egipto', 'AFRICA'], ['AE', 'Emiratos Árabes Unidos', 'MIDDLE_EAST'], ['SA', 'Arabia Saudita', 'MIDDLE_EAST'],
].map(([code, name, group]) => Object.freeze({ code, name, group })));
export const AVAILABILITY_STATES = Object.freeze(['SUPPORTED', 'PARTIAL', 'UNAVAILABLE']);
// Explicit DEMO matrix. No country licensing claims. TODO(student): replace with approved rules.
const demoSupported = { BO: ['es'], MX: ['es'], AR: ['es'], CL: ['es'], CO: ['es'], PE: ['es'], BR: ['pt'], US: ['en', 'es'], CA: ['en', 'fr'], ES: ['es'], GB: ['en'], FR: ['fr'], DE: ['de'], IT: ['it'], JP: ['ja'], KR: ['ko'], CN: ['zh'], IN: ['en'], AU: ['en'], ZA: ['en'], EG: ['ar'], AE: ['ar', 'en'], SA: ['ar'] };
export function getAvailability(region, language) {
  if (!Object.hasOwn(demoSupported, region) || !['es', 'en', 'pt', 'fr', 'de', 'it', 'ja', 'ko', 'zh', 'ar'].includes(language)) return 'UNAVAILABLE';
  if (region === 'CN' && language === 'it') return 'UNAVAILABLE'; // Fixture to exercise the unavailable state.
  return demoSupported[region].includes(language) ? 'SUPPORTED' : 'PARTIAL';
}
