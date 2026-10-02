import { el } from '../utils/dom.js';
import { t } from '../services/localization.service.js';
import { openDrawer } from './drawer.js';
import { readPreferences } from '../services/storage.service.js';
export const NOTIFICATION_CATEGORIES = Object.freeze(['content', 'account', 'security', 'billing', 'devices', 'system']);
export function openNotifications() {
  const enabled = readPreferences().playerPreferences?.notifications !== false;
  return openDrawer({ title: t('nav.notifications'), content: enabled ? NOTIFICATION_CATEGORIES.map(category => el('article', { class: 'notification-item' }, [
    el('strong', { text: t(`notification.${category}`) }), el('p', { text: t('notification.placeholder') }),
  ])) : el('p', { text: t('notification.empty') }) });
}
