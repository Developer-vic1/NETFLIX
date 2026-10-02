import { openModal } from "./modal.js";
export function openDrawer(options) {
  return openModal({ ...options, drawer: true });
}
