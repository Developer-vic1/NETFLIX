import { UI_STATES } from '../config/app-config.js';
import { el, button } from '../utils/dom.js';
import { t } from '../services/localization.service.js';
export function stateView(state, message, retry) {
  const valid = UI_STATES.includes(state) ? state : 'error';
  return el('div', { class: 'state', 'data-state': valid, role: valid === 'error' ? 'alert' : 'status' }, [
    el('strong', { text: t(`state.${valid}`) }), el('p', { text: message || t('common.todo') }),
    retry ? button(t('common.retry'), retry) : null,
  ]);
}
