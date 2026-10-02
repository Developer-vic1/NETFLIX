export const APP_CONFIG = Object.freeze({
  name: 'Netflix Streaming Intelligence Platform',
  defaultLanguage: 'es', defaultRegion: 'BO',
  storageKey: 'nsip.preferences.v1',
  maxEvents: 100, maxMetricPoints: 60,
  searchDelay: 280,
  // CSS media queries are centralized in css/layout.css; these mirror their contract.
  breakpoints: Object.freeze({ mobile: 576, tablet: 768, desktop: 992, large: 1200, extraLarge: 1440 }),
});
export const UI_STATES = Object.freeze(['loading', 'ready', 'empty', 'warning', 'error', 'offline', 'retrying', 'success']);
