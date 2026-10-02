import { el, field, select } from '../utils/dom.js';
import { LANGUAGES } from '../config/languages.js';
import { REGIONS, REGION_GROUPS, getAvailability } from '../config/regions.js';
import { QUALITIES } from '../services/streaming.service.js';
import { t, getLocalization, setLocalization } from '../services/localization.service.js';
import { readPreferences, writePreferences } from '../services/storage.service.js';
import { toast } from '../components/toast.js';
import { eventBus } from '../services/event-bus.service.js';
export function renderSettings({ root, refresh }) {
  const current = getLocalization();
  const preferences = readPreferences().playerPreferences || {};
  const languageOptions = LANGUAGES.map(item => [item.code, item.nativeName]);
  const language = select(languageOptions, current.language, { id: 'settings-language' });
  const region = el('select', { id: 'settings-region' });
  for (const group of REGION_GROUPS) region.append(el('optgroup', { label: group }, REGIONS.filter(item => item.group === group).map(item => el('option', { value: item.code, text: `${item.code} · ${item.name}` }))));
  region.value = current.region;
  const audio = select(languageOptions, preferences.audio || current.language, { id: 'settings-audio' });
  const subtitles = select([['off', t('settings.off')], ...languageOptions], preferences.subtitles || 'off', { id: 'settings-subtitles' });
  const quality = select(QUALITIES.map(item => [item, item]), preferences.quality || 'Auto', { id: 'settings-quality' });
  const checkbox = (key, label, checked) => {
    const input = el('input', { type: 'checkbox', id: key, checked });
    return { input, label: el('label', { class: 'check-field', for: key }, [input, label]) };
  };
  const autoplay = checkbox('settings-autoplay', t('settings.autoplay'), preferences.autoplay === true);
  const reduced = checkbox('settings-reduced', t('settings.reduced'), preferences.reducedMotion === true);
  const notifications = checkbox('settings-notifications', t('settings.notifications'), preferences.notifications !== false);
  const availability = el('div', { class: 'notice', role: 'status', 'aria-live': 'polite' });
  const translationNote = el('p', { class: 'notice', 'data-tone': 'warning' });
  const updateAvailability = () => {
    const state = getAvailability(region.value, language.value);
    availability.dataset.tone = state === 'SUPPORTED' ? 'info' : 'warning';
    availability.textContent = `${state} · ${t(`settings.${state === 'SUPPORTED' ? 'supported' : state === 'PARTIAL' ? 'partial' : 'unavailable'}`)}`;
    translationNote.hidden = LANGUAGES.find(item => item.code === language.value).coverage !== 'PARTIAL';
    translationNote.textContent = t('settings.translationPartial');
  };
  language.addEventListener('change', updateAvailability); region.addEventListener('change', updateAvailability); updateAvailability();
  const form = el('form', { class: 'settings-form panel' }, [
    el('div', { class: 'form-grid' }, [field(t('settings.language'), language), field(t('settings.region'), region), field(t('settings.audio'), audio), field(t('settings.subtitles'), subtitles), field(t('settings.quality'), quality)]),
    el('fieldset', {}, [el('legend', { text: t('settings.accessibility') }), el('div', { class: 'settings-checkboxes' }, [autoplay.label, reduced.label, notifications.label])]),
    el('div', { class: 'settings-summary' }, [el('h2', { text: t('settings.availability') }), availability, translationNote, el('p', { class: 'muted', text: t('settings.matrixNote') }), el('p', { class: 'muted', text: t('settings.direction', { direction: current.direction.toUpperCase() }) })]),
    el('div', {}, el('button', { type: 'submit', class: 'button button-primary', text: t('common.save') })),
  ]);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const localeStored = setLocalization(language.value, region.value);
    const stored = writePreferences({ ...readPreferences(), language: language.value, region: region.value, playerPreferences: {
      audio: audio.value, subtitles: subtitles.value, quality: quality.value, autoplay: autoplay.input.checked, reducedMotion: reduced.input.checked, notifications: notifications.input.checked,
    } });
    // Apply even when storage is blocked; no reliance on a successful write.
    document.documentElement.classList.toggle('reduce-motion', reduced.input.checked);
    eventBus.emit('LOCALIZATION_CHANGED', `${region.value}/${language.value}`);
    refresh(); toast(t(localeStored && stored ? 'common.saved' : 'common.storageError'), stored ? 'success' : 'warning');
    document.getElementById('settings-language')?.focus();
  });
  root.append(el('div', { class: 'container page' }, [
    el('div', { class: 'page-header' }, el('div', {}, [el('span', { class: 'eyebrow accent', text: t('nav.settings') }), el('h1', { class: 'page-title', text: t('settings.title') }), el('p', { class: 'muted', text: t('settings.subtitle') })])), form,
  ]));
}
