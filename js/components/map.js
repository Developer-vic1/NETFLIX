import { THEME } from '../config/theme.js';
import { el, field, select } from '../utils/dom.js';
import { REGIONS, getAvailability } from '../config/regions.js';
import { getLocalization, t } from '../services/localization.service.js';
import { mapFixture } from '../data/metrics.js';
export function regionalMap(parent) {
  const colors = THEME.colors;
  const mapNode = el('div', { id: 'world-map', class: 'map-frame', 'aria-hidden': 'true' });
  const regionSelect = select(REGIONS.map(item => [item.code, item.name]), getLocalization().region, { id: 'map-region' });
  const summary = el('p', { class: 'map-summary', role: 'status' });
  const description = (code) => {
    const fixture = mapFixture[code];
    return `${t('operations.mapDisclaimer')} · ${code} · ${t('operations.availability')}: ${getAvailability(code, getLocalization().language)} · ${fixture ? `${t('operations.latency')}: ${fixture.latency} ms · ${t('operations.streams')}: ${fixture.streams} · ${t('operations.instances')}: ${fixture.instances}` : t('operations.noFixture')}`;
  };
  const update = () => { summary.textContent = description(regionSelect.value); };
  regionSelect.addEventListener('change', update); update();
  parent.append(mapNode, field(t('settings.region'), regionSelect, t('operations.mapKeyboard')), summary);
  let map;
  try {
    if (!window.jsVectorMap) throw new Error('Missing local map library');
    map = new window.jsVectorMap({
      selector: '#world-map', map: 'world', backgroundColor: colors.panel,
      zoomButtons: false, zoomOnScroll: false, draggable: false,
      regionStyle: { initial: { fill: colors.surface, stroke: colors.border, strokeWidth: .5 }, hover: { fill: colors.primary }, selected: { fill: colors.primary } },
      selectedRegions: Object.keys(mapFixture),
      onRegionTooltipShow(event, tooltip, code) { tooltip.text(description(code)); },
    });
  } catch { mapNode.replaceChildren(el('p', { role: 'alert', text: t('common.error') })); }
  const observer = new ResizeObserver(() => map?.updateSize()); observer.observe(mapNode);
  return () => { observer.disconnect(); map?.destroy(); };
}
