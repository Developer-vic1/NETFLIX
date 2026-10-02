import { el, button } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { t, getLocalization } from '../services/localization.service.js';
import { openDrawer } from './drawer.js';
import { openNotifications } from './notification-center.js';
const routes = [['home', 'nav.home'], ['series', 'nav.series'], ['movies', 'nav.movies'], ['new', 'nav.new'], ['my-list', 'nav.myList']];
export function navbar(route) {
  const links = () => routes.map(([path, key]) => el('a', { class: 'nav-link', href: `#/${path}`, 'aria-current': route === path ? 'page' : false, text: t(key) }));
  const menuButton = button(icon('menu'), () => {
    menuButton.setAttribute('aria-expanded', 'true');
    const drawer = openDrawer({ title: t('nav.menu'), content: el('nav', { 'aria-label': t('nav.menu') }, [
      ...links(), el('a', { href: '#/settings', text: t('nav.settings') }), el('a', { href: '#/operations', text: t('nav.operations') }), el('a', { href: '#/account', text: t('nav.profile') }),
    ]), onClose: () => menuButton.setAttribute('aria-expanded', 'false') });
    drawer.id = 'navigation-drawer';
  }, 'icon-button menu-toggle', { 'aria-label': t('nav.menu'), 'aria-expanded': 'false', 'aria-controls': 'navigation-drawer' });
  const locale = getLocalization();
  return el('div', { class: 'container header-inner' }, [
    menuButton,
    el('a', { class: 'brand', href: '#/home', 'aria-label': 'Netflix Streaming Intelligence Platform' }, [el('span', { class: 'brand-mark', text: 'NETFLIX' }), el('span', { class: 'brand-caption', text: 'Streaming Intelligence Platform' })]),
    el('nav', { class: 'desktop-nav', 'aria-label': t('nav.menu') }, links()),
    el('div', { class: 'header-actions' }, [
      el('a', { class: 'region-chip', href: '#/settings', 'aria-label': t('nav.settings') }, [el('span', { class: 'dot' }), `${locale.region} / ${locale.language.toUpperCase()}`]),
      el('a', { class: 'icon-button', href: '#/search', 'aria-label': t('nav.search') }, icon('search')),
      button(icon('bell'), openNotifications, 'icon-button', { 'aria-label': t('nav.notifications') }),
      el('a', { class: 'icon-button', href: '#/account', 'aria-label': t('nav.profile') }, el('span', { class: 'avatar', text: 'D', 'aria-hidden': 'true' })),
    ]),
  ]);
}
