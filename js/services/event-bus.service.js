import { APP_CONFIG } from "../config/app-config.js";
export function createEventBus(limit = APP_CONFIG.maxEvents) {
  const listeners = new Set();
  const history = [];
  const cap = Math.max(
    1,
    Math.min(APP_CONFIG.maxEvents, Number(limit) || APP_CONFIG.maxEvents),
  );
  return {
    emit(name, details = "", context = {}) {
      const event = Object.freeze({
        time: new Date().toLocaleTimeString("en-GB", { hour12: false }),
        name: String(name),
        details: String(details),
        ...(typeof context.profileId === "string"
          ? { profileId: context.profileId }
          : {}),
      });
      history.push(event);
      if (history.length > cap) history.splice(0, history.length - cap);
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          /* A subscriber cannot break delivery. */
        }
      }
      return event;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get history() {
      return [...history];
    },
  };
}
export const eventBus = createEventBus();
