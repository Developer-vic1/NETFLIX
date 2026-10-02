import { el, button } from '../utils/dom.js';
import { t } from '../services/localization.service.js';
import { profiles } from '../data/profiles.js';
import { plans } from '../data/plans.js';
import { getBillingSummary } from '../services/billing.service.js';
import { stateView } from '../components/state.js';
import { openNotifications } from '../components/notification-center.js';
import { toast } from '../components/toast.js';
export function renderAccount({ root, navigate }) {
  const panel = (key, content) => el('section', { class: 'panel' }, [el('h2', { text: t(key) }), ...content]);
  root.append(el('div', { class: 'container page' }, [
    el('div', { class: 'page-header' }, el('div', {}, [el('span', { class: 'eyebrow accent', text: t('common.demo') }), el('h1', { class: 'page-title', text: t('account.title') }), el('p', { class: 'muted', text: t('account.subtitle') })])),
    el('section', { class: 'panel account-profile', 'aria-label': t('account.summary') }, [el('span', { class: 'avatar', text: profiles[0].initials, 'aria-hidden': 'true' }), el('div', {}, [el('h2', { text: profiles[0].name }), el('span', { class: 'badge badge-demo', text: t('common.demo') })])]),
    el('div', { class: 'account-grid' }, [
      panel('account.subscription', [el('p', { class: 'account-value', text: t(plans[0].labelKey) }), el('p', { text: t('common.todo') })]),
      panel('account.payment', [stateView(getBillingSummary().state, t('account.paymentEmpty'))]),
      panel('account.devices', [el('p', { text: t('account.deviceDemo') })]),
      panel('account.profiles', [el('p', { class: 'account-value', text: profiles[0].name }), el('p', { text: t('common.todo') })]),
      panel('account.preferences', [el('div', { class: 'panel-actions' }, button(t('common.configure'), () => navigate('settings')))]),
      panel('account.security', [el('p', { text: t('account.securityTodo') }), el('div', { class: 'panel-actions' }, button(t('account.logout'), () => toast(t('account.logoutDemo'), 'info')))]),
      panel('nav.notifications', [el('div', { class: 'panel-actions' }, button(t('nav.notifications'), openNotifications))]),
    ]),
  ]));
}
