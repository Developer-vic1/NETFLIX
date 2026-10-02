import { el, button, field } from '../utils/dom.js';
import { t } from '../services/localization.service.js';
import { readPreferences, writePreferences } from '../services/storage.service.js';
import { playerShell } from '../components/player.js';
import { networkPreview } from '../services/streaming.service.js';
import { toast } from '../components/toast.js';
import { eventBus } from '../services/event-bus.service.js';
export function renderPlayer({ root, navigate }) {
  const preferences = readPreferences().playerPreferences || {};
  const player = playerShell(preferences);
  const bandwidth = el('input', { type: 'number', min: 0, max: 100, step: .1, value: 20, id: 'network-bandwidth', required: true });
  const result = el('p', { class: 'notice', role: 'status', text: t('common.simulation') });
  const networkForm = el('form', { class: 'panel' }, [el('h2', { text: t('player.network') }), field(t('player.bandwidth'), bandwidth), el('div', { class: 'panel-actions' }, el('button', { type: 'submit', class: 'button', text: t('player.preview') })), result]);
  networkForm.addEventListener('submit', event => {
    event.preventDefault();
    try {
      if (!bandwidth.value.trim()) throw new RangeError('Empty input');
      const preview = networkPreview(bandwidth.value, player.quality.value);
      result.textContent = t('player.previewResult', { mbps: preview.mbps, quality: preview.requestedQuality });
      result.dataset.tone = preview.state === 'offline' ? 'warning' : 'info';
      eventBus.emit('NETWORK_CHANGED', `SIMULATION input ${preview.mbps} Mbps`);
    } catch { toast(t('player.invalid'), 'error'); }
  });
  const savePreferences = () => {
    const stored = writePreferences({ ...readPreferences(), playerPreferences: { ...preferences, quality: player.quality.value, audio: player.audio.value, subtitles: player.subtitles.value } });
    toast(t(stored ? 'common.saved' : 'common.storageError'), stored ? 'success' : 'warning');
  };
  root.append(el('div', { class: 'container page' }, [
    el('div', { class: 'page-header' }, [el('div', {}, [el('span', { class: 'eyebrow accent', text: t('common.demo') }), el('h1', { class: 'page-title', text: t('player.title') }), el('p', { class: 'muted', text: t('player.subtitle') })]), button(t('common.back'), () => navigate('home'), 'button button-ghost')]),
    player.stage, player.controls, player.selectors,
    el('div', { class: 'panel-actions' }, [button(t('common.save'), savePreferences), button(t('player.next'), () => toast(t('player.nextTodo'), 'info'))]),
    el('div', { class: 'catalog-section' }, networkForm),
  ]));
}
