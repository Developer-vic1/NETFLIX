import { el, button } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { t } from '../services/localization.service.js';
import { openModal } from './modal.js';
export function movieCard(title, { inList, toggleList, navigate, state = 'ready', continueWatching = false }) {
  const name = t('title.name', { number: title.number });
  const card = el('article', { class: 'movie-card', 'data-state': state });
  if (state === 'error' || state === 'loading') {
    card.append(el('div', { class: 'movie-poster poster-1', role: 'status', text: t(`state.${state}`) })); return card;
  }
  card.append(el('div', { class: `movie-poster poster-${title.number.replace(/^0/, '')}`, 'aria-hidden': 'true' }, [
    el('span', { class: 'badge badge-demo', text: t('common.demo') }), el('span', { class: 'poster-number', text: title.number }),
  ]));
  if (continueWatching) {
    const progress = el('div', { class: 'progress-fill' }); progress.style.width = `${title.progress}%`;
    card.append(el('div', { class: 'progress-track', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': title.progress, 'aria-label': name }, progress));
  }
  const added = inList(title.id);
  const listButton = button(icon(added ? 'check' : 'plus'), () => {
    const isAdded = toggleList(title.id); listButton.replaceChildren(icon(isAdded ? 'check' : 'plus'));
    listButton.setAttribute('aria-label', `${t(isAdded ? 'title.remove' : 'title.add')} · ${name}`);
    listButton.setAttribute('aria-pressed', String(isAdded));
  }, 'icon-button', { 'aria-label': `${t(added ? 'title.remove' : 'title.add')} · ${name}`, 'aria-pressed': String(added), 'data-list-id': title.id });
  card.append(el('div', { class: 'movie-info' }, [
    el('h3', { text: name }), el('p', { class: 'movie-meta', text: continueWatching ? t('title.progress', { progress: title.progress }) : `${t(`title.${title.type}`)} · ${title.year}` }),
    el('div', { class: 'card-actions' }, [button([icon('play'), t('title.play')], () => navigate(`player?title=${title.id}`), 'button', { 'aria-label': `${t('title.play')} · ${name}` }), listButton]),
    button(t('common.details'), () => openModal({ title: name, content: [el('span', { class: 'badge badge-demo', text: t('common.demo') }), el('p', { text: t('title.description') })] }), 'text-link', { 'aria-label': `${t('common.details')} · ${name}` }),
  ]));
  return card;
}
