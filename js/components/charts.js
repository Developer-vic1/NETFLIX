import { THEME } from '../config/theme.js';
import { el } from '../utils/dom.js';
import { t } from '../services/localization.service.js';
import { appendMetric } from '../services/monitoring.service.js';
export function latencyChart(parent, initialPoints) {
  const initial = initialPoints.filter(Number.isFinite).slice(-60);
  const colors = THEME.colors;
  const canvas = el('canvas', { role: 'img', 'aria-label': t('operations.chartLabel') });
  const summary = el('p', { class: 'sr-only', text: `${t('operations.chartLabel')}: ${initial.join(', ')}` });
  parent.append(el('div', { class: 'chart-frame' }, canvas), summary);
  if (!window.Chart) { parent.append(el('p', { role: 'alert', text: t('common.error') })); return { append() {}, destroy() {} }; }
  const chart = new window.Chart(canvas, {
    type: 'line',
    data: { labels: initial.map((_, i) => i + 1), datasets: [{ label: t('operations.chartLabel'), data: initial, borderColor: colors.primary, backgroundColor: colors.primary, tension: .3, borderWidth: 2, pointRadius: 2, fill: false }] },
    options: { responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false }, ticks: { color: colors.text, maxTicksLimit: 6 } }, y: { grid: { color: colors.border }, ticks: { color: colors.text }, beginAtZero: true } },
    },
  });
  return {
    append(point) {
      const points = appendMetric(chart.data.datasets[0].data, point);
      chart.data.datasets[0].data = points; chart.data.labels = points.map((_, i) => i + 1);
      summary.textContent = `${t('operations.chartLabel')}: ${points.join(', ')}`; chart.update('none');
    },
    destroy() { chart.destroy(); },
  };
}
