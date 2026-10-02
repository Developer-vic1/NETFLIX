import { el, button, select, field } from '../utils/dom.js';
import { t } from '../services/localization.service.js';
import { metricFixture, SERVICE_NAMES, SCALE_STATES } from '../data/metrics.js';
import { createMonitoringFixture } from '../services/monitoring.service.js';
import { eventBus } from '../services/event-bus.service.js';
import { latencyChart } from '../components/charts.js';
import { regionalMap } from '../components/map.js';
export function renderOperations({ root }) {
  const fixture = createMonitoringFixture();
  const page = el('div', { class: 'container page' }); root.append(page);
  page.append(el('div', { class: 'page-header' }, [el('div', {}, [el('span', { class: 'eyebrow accent', text: t('common.simulation') }), el('h1', { class: 'page-title', text: t('operations.title') }), el('p', { class: 'muted', text: t('operations.subtitle') })]), el('span', { class: 'badge badge-demo', text: t('common.demo') })]));
  const metrics = [['operations.latency', `${metricFixture.latency.at(-1)} ms`], ['operations.streams', metricFixture.streams.toLocaleString()], ['operations.instances', metricFixture.instances], ['operations.cpu', `${metricFixture.cpu}%`]];
  page.append(el('div', { class: 'metrics-grid' }, metrics.map(([label, value]) => el('section', { class: 'panel' }, [
    el('p', { class: 'metric-label', text: t(label) }), el('p', { class: 'metric-value', text: value }), el('span', { class: 'badge badge-demo', text: t('common.demo') }),
  ]))));
  const chartPanel = el('section', { class: 'panel' }, [el('h2', { text: t('operations.charts') }), el('p', { class: 'muted', text: t('operations.mapDisclaimer') })]);
  const mapPanel = el('section', { class: 'panel' }, [el('h2', { text: t('operations.map') }), el('p', { class: 'muted', text: t('operations.mapDisclaimer') })]);
  page.append(el('div', { class: 'split-layout' }, [chartPanel, mapPanel]));
  const chart = latencyChart(chartPanel, [...metricFixture.latency]);
  chartPanel.append(el('div', { class: 'panel-actions' }, button(t('operations.append'), () => { chart.append(32); eventBus.emit('METRIC_FIXTURE_APPENDED', '32 ms · DEMO'); })));
  const destroyMap = regionalMap(mapPanel);
  const serviceGrid = el('div', { class: 'service-grid' });
  const drawServices = () => serviceGrid.replaceChildren(...fixture.services.map(service => el('div', { class: 'service-item' }, [el('span', { text: service.name }), el('span', { class: 'service-status', 'data-status': service.status, text: service.status })])));
  drawServices();
  const serviceSelect = select(SERVICE_NAMES.map(name => [name, name]), SERVICE_NAMES[0], { id: 'service-select' });
  page.append(el('section', { class: 'panel catalog-section' }, [el('h2', { text: t('operations.services') }), serviceGrid,
    el('div', { class: 'panel-actions' }, [field(t('operations.service'), serviceSelect), button(t('operations.advance'), () => { const status = fixture.advance(serviceSelect.value); drawServices(); eventBus.emit('SERVICE_FIXTURE_CHANGED', `${serviceSelect.value} ${status} · SIMULATION`); })]),
  ]));
  const consoleList = el('ol', { class: 'event-console', 'aria-label': t('operations.events') });
  const drawEvents = () => consoleList.replaceChildren(...eventBus.history.map(event => el('li', { text: `${event.time} ${event.name} ${event.details}` })));
  drawEvents(); const unsubscribe = eventBus.subscribe(drawEvents);
  const scalingSelect = select(SCALE_STATES.map(state => [state, state]), 'NORMAL', { id: 'scaling-state' });
  scalingSelect.addEventListener('change', () => eventBus.emit('SCALING_STATE_PREVIEW', `${scalingSelect.value} · SIMULATION`));
  page.append(el('div', { class: 'split-layout' }, [el('section', { class: 'panel' }, [el('h2', { text: t('operations.events') }), consoleList]),
    el('div', { class: 'stack' }, [el('section', { class: 'panel' }, [el('h2', { text: t('operations.autoscaling') }), el('p', { text: t('operations.scalingTodo') }), field(t('operations.scaling'), scalingSelect)]), el('section', { class: 'panel' }, [el('h2', { text: t('operations.incidents') }), el('p', { text: t('operations.incidentTodo') })])]),
  ]));
  eventBus.emit('OPERATIONS_LOADED', 'Local fixture only');
  return () => { unsubscribe(); chart.destroy(); destroyMap(); };
}
