import { el } from './utils/dom.js';
import { t, getLocalization } from './services/localization.service.js';
import { readPreferences, writePreferences } from './services/storage.service.js';
import { eventBus } from './services/event-bus.service.js';
import { titles } from './data/titles.js';
import { navbar } from './components/navbar.js';
import { toast, clearToasts } from './components/toast.js';
import { closeModal } from './components/modal.js';
import { stateView } from './components/state.js';
import { renderHome } from './pages/home.js';
import { renderSettings } from './pages/settings.js';
import { renderAccount } from './pages/account.js';
import { renderPlayer } from './pages/player.js';
import { renderOperations } from './pages/operations.js';
const root = document.getElementById('app');
const storedList = readPreferences().myList;
const myList = new Set(Array.isArray(storedList) ? storedList.filter(id => titles.some(title => title.id === id)) : []);
let cleanup = () => {};
const navigate = (route) => { location.hash = `/${route}`; };
function render() {
  cleanup(); cleanup = () => {}; closeModal(); clearToasts();
  const route = location.hash.replace(/^#\/?/, '').split('?')[0] || 'home';
  root.dataset.route = route;
  document.getElementById('header').replaceChildren(navbar(route));
  document.getElementById('skip-link').textContent = t('common.skip');
  document.getElementById('footer').replaceChildren(el('div', { class: 'container footer-inner' }, [
    el('div', {}, [el('p', { text: 'Netflix Streaming Intelligence Platform' }), el('p', { text: `${t('common.academic')} · ${t('common.notOfficial')}` })]),
    el('nav', { class: 'footer-links', 'aria-label': t('nav.settings') }, [el('a', { href: '#/settings', text: t('nav.settings') }), el('a', { href: '#/operations', text: t('nav.operations') }), el('a', { href: 'README.md', text: t('common.docs') })]),
  ]));
  root.replaceChildren(); root.classList.remove('view-enter'); void root.offsetWidth; root.classList.add('view-enter');
  const context = { root, route, navigate, refresh: render, inList: id => myList.has(id), toggleList(id) {
    const added = !myList.has(id); if (added) myList.add(id); else myList.delete(id);
    const stored = writePreferences({ ...readPreferences(), myList: [...myList] });
    eventBus.emit('MY_LIST_CHANGED', `${id} ${added ? 'added' : 'removed'}`);
    // Refresh list views after the button event finishes, so every duplicate card stays synchronized.
    const notify = () => toast(t(stored ? added ? 'title.added' : 'title.removed' : 'common.storageError'), stored ? 'success' : 'warning');
    if (route === 'my-list' || route === 'home') queueMicrotask(() => {
      const y = scrollY; render(); scrollTo({ top: y, behavior: 'instant' });
      (root.querySelector(`[data-list-id="${id}"]`) || root).focus({ preventScroll: true }); notify();
    });
    else notify();
    return added;
  } };
  try {
    const renderers = { home: renderHome, series: renderHome, movies: renderHome, new: renderHome, 'my-list': renderHome, search: renderHome, settings: renderSettings, account: renderAccount, player: renderPlayer, operations: renderOperations };
    if (!renderers[route]) { root.append(el('div', { class: 'container page' }, stateView('error', t('common.noResults'), () => navigate('home')))); }
    else cleanup = renderers[route](context) || (() => {});
  } catch (error) {
    console.error('Interface render failed', error);
    root.replaceChildren(el('div', { class: 'container page' }, stateView('error', t('common.error'), render)));
  }
  const network = document.getElementById('network-status'); network.hidden = navigator.onLine; network.textContent = t('common.offline');
  document.title = `Netflix Streaming Intelligence Platform · ${t('common.academic')}`;
  if (route === 'home') eventBus.emit('HOME_LOADED', `${getLocalization().region}/${getLocalization().language} · DEMO`);
}
document.documentElement.classList.toggle('reduce-motion', readPreferences().playerPreferences?.reducedMotion === true);
document.getElementById('skip-link').addEventListener('click', event => { event.preventDefault(); root.focus(); root.scrollIntoView({ behavior: 'auto' }); });
window.addEventListener('hashchange', () => { render(); scrollTo({ top: 0, behavior: 'instant' }); if (!location.hash.includes('search')) root.focus({ preventScroll: true }); });
window.addEventListener('offline', () => { document.getElementById('network-status').hidden = false; });
window.addEventListener('online', () => { document.getElementById('network-status').hidden = true; });
window.addEventListener('pagehide', () => { cleanup(); closeModal(); clearToasts(); });
render();
