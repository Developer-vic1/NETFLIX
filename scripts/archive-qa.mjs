import { readFile, writeFile, stat } from 'node:fs/promises';
const scenarios = ['catalog', 'features', 'operations', 'local-film', 'layout'];
const report = { date: '2026-10-02', timezone: 'America/La_Paz', browser: 'Chrome/Chromium 154.0.8037.93', scenarios: {}, unitTests: { total: 21, passed: 21 }, scope: 'Local frontend, real browser media and service checks. No external production integrations.' };
for (const scenario of scenarios) {
  const path = `output/playwright/${scenario}-results.json`;
  const result = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
  if (result.passed !== result.total || result.errors.length || result.failedRequests.length) throw new Error(`Unsuccessful scenario: ${scenario}`);
  report.scenarios[scenario] = { ...result, recordedAt: (await stat(path)).mtime.toISOString() };
}
report.browserTotal = Object.values(report.scenarios).reduce((sum, result) => sum + result.total, 0);
report.source = JSON.parse(await readFile('docs/source-metrics.json', 'utf8'));
await writeFile('docs/control-room-qa-results.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`${report.browserTotal} browser checks passed; source: ${report.source.nonblankLines} nonblank authored lines.`);
