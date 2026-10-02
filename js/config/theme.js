// Read the source of truth; never duplicate CSS color literals in JS.
const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const THEME = Object.freeze({
  get colors() {
    return { primary: token('--brand-primary'), success: token('--success'), warning: token('--warning'), danger: token('--danger'), info: token('--info'), text: token('--text-secondary'), border: token('--border-default'), panel: token('--bg-panel'), surface: token('--bg-card-hover') };
  },
});
