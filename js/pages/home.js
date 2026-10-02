import { el, button, debounce } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { titles } from '../data/titles.js';
import { t, getLocalization } from '../services/localization.service.js';
import { movieCard } from '../components/movie-card.js';
import { openModal } from '../components/modal.js';
import { stateView } from '../components/state.js';
import { getRecommendations } from '../services/recommendation.service.js';
import { APP_CONFIG } from '../config/app-config.js';
export function renderHome(context) {
  const { root, route, navigate } = context;
  const section = (key, items, extra = {}) => el('section', { class: 'catalog-section', 'aria-label': t(key) }, [
    el('div', { class: 'section-header' }, [el('h2', { text: t(key) }), el('span', { class: 'badge badge-demo', text: t('common.demo') })]),
    items.length ? el('div', { class: extra.continueWatching ? 'continue-grid' : 'catalog-grid' }, items.map(title => movieCard(title, { ...context, ...extra }))) : stateView('empty', key === 'nav.myList' ? t('home.myListEmpty') : t('common.noResults')),
  ]);
  if (route === 'home') {
    root.append(el('section', { class: 'hero', 'aria-label': t('hero.title') }, [
      el('div', { class: 'hero-art', 'aria-hidden': 'true' }), el('div', { class: 'hero-shade', 'aria-hidden': 'true' }),
      el('div', { class: 'container' }, [el('div', { class: 'hero-content' }, [
        el('span', { class: 'eyebrow accent', text: t('hero.eyebrow') }), el('h1', { text: t('hero.title') }),
        el('p', { class: 'hero-description', text: t('hero.description') }), el('div', { class: 'hero-actions' }, [
          button([icon('play'), t('hero.explore')], () => { const catalog = document.getElementById('catalog-heading'); catalog.scrollIntoView({ behavior: 'auto' }); catalog.focus(); }, 'button button-light'),
          button([icon('info'), t('hero.secondary')], () => openModal({ title: t('common.academic'), content: [el('p', { text: t('common.notOfficial') }), el('p', { text: t('common.todo') }), el('a', { href: 'docs/STUDENT-TODO.md', class: 'text-link', text: t('common.docs') })] }), 'button button-ghost'),
        ]),
      ]), el('div', { class: 'hero-bottom' }, [el('span', { class: 'hero-index', text: t('hero.edition') }), el('span', { text: t('hero.art') })])]),
    ]));
  }
  const page = el('div', { class: `container${route === 'home' ? '' : ' page'}` }); root.append(page);
  let initialItems = titles;
  if (route === 'series' || route === 'movies') initialItems = titles.filter(title => title.type === route);
  if (route === 'new') initialItems = titles.filter(title => title.isNew);
  if (route === 'my-list') initialItems = titles.filter(title => context.inList(title.id));
  if (route !== 'home') {
    const key = { series: 'nav.series', movies: 'nav.movies', new: 'nav.new', 'my-list': 'nav.myList', search: 'nav.search' }[route];
    page.append(el('h1', { class: 'page-title', text: t(key) }));
  }
  const search = el('input', { type: 'search', id: 'catalog-search', placeholder: t('home.searchHint'), autocomplete: 'off' });
  const searchStatus = el('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const content = el('div', { id: 'catalog-content' });
  const chips = el('div', { class: 'tab-list', 'aria-label': t('home.catalog') });
  let filter = 'all';
  const drawCatalog = () => {
    const query = search.value.trim().toLocaleLowerCase(getLocalization().language);
    const filtered = initialItems.filter(title => (filter === 'all' || title.type === filter) && `${t('title.name', { number: title.number })} ${t(`title.${title.type}`)}`.toLocaleLowerCase(getLocalization().language).includes(query));
    content.dataset.searchState = query ? filtered.length ? 'results' : 'no-results' : 'idle';
    searchStatus.textContent = t('home.searchStatus', { count: filtered.length });
    content.replaceChildren(section(route === 'my-list' ? 'nav.myList' : 'home.catalog', filtered));
  };
  for (const [key, label] of [['all', 'common.all'], ['series', 'nav.series'], ['movies', 'nav.movies'], ['documentaries', 'home.documentaries']]) {
    const chip = button(t(label), () => { filter = key; for (const node of chips.children) node.setAttribute('aria-pressed', String(node === chip)); drawCatalog(); }, 'filter-chip', { 'aria-pressed': String(key === 'all') }); chips.append(chip);
  }
  const runSearch = debounce(drawCatalog, APP_CONFIG.searchDelay);
  search.addEventListener('input', () => { content.dataset.searchState = 'typing'; runSearch(); });
  page.append(el('div', { class: 'home-toolbar' }, [chips, el('label', { class: 'search-box' }, [el('span', { class: 'sr-only', text: t('nav.search') }), search])]), searchStatus,
    el('h2', { id: 'catalog-heading', class: 'sr-only', tabindex: '-1', text: t('home.catalog') }));
  if (route === 'home') page.append(section('home.continue', titles.slice(0, 3), { continueWatching: true }));
  page.append(content); drawCatalog();
  if (route === 'home') {
    const regionNote = el('p', { class: 'notice', text: `${getLocalization().region} · ${t('settings.matrixNote')}` });
    page.append(section('home.trending', titles.slice(0, 3)), regionNote,
      el('section', { class: 'catalog-section' }, [el('h2', { text: t('home.recommendations') }), stateView(getRecommendations().state, t('home.recommendationsTodo'))]),
      section('nav.myList', titles.filter(title => context.inList(title.id))),
      section('nav.series', titles.filter(title => title.type === 'series')),
      section('nav.movies', titles.filter(title => title.type === 'movies')),
      section('home.documentaries', titles.filter(title => title.type === 'documentaries')),
      section('home.new', titles.filter(title => title.isNew)),
      el('section', { class: 'panel home-todo catalog-section' }, [el('div', {}, [el('h2', { text: t('home.foundation') }), el('p', { class: 'muted', text: t('home.foundationBody') })]), button([t('nav.operations'), icon('arrow', true)], () => navigate('operations'), 'button button-primary')]),
    );
  }
  if (route === 'search') search.focus();
  return () => runSearch.cancel();
}
