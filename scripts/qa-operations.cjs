async (page) => {
  const results = [], errors = [], failedRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });
  const check = (name, pass) => results.push({ name, pass: !!pass });
  const navigate = async route => {
    await page.goto(`http://127.0.0.1:4173/#/${route}`);
    await page.waitForFunction(expected => document.querySelector('#app').dataset.route === expected && !document.documentElement.classList.contains('route-transition'), route.split('?')[0]);
  };
  const switchTo = async name => {
    await page.locator('.profile-trigger').click();
    await page.locator('.profile-option').filter({ hasText: name }).click();
    await page.locator('dialog').waitFor({ state: 'detached' });
    await page.waitForFunction(() => !document.documentElement.classList.contains('route-transition'));
  };
  await navigate('profiles'); await page.reload(); await switchTo('Víctor Asturizaga');
  await navigate('title?title=caminandes-2');
  await page.getByRole('button', { name: 'Me gusta', exact: true }).click();
  check('individual rating is stored in viewer profile', await page.getByRole('button', { name: 'Me gusta', exact: true }).getAttribute('aria-pressed') === 'true');
  await page.reload();
  check('title rating survives reload', await page.getByRole('button', { name: 'Me gusta', exact: true }).getAttribute('aria-pressed') === 'true');
  check('series detail exposes both actual downloadable episodes', await page.locator('.episode-row').count() === 2);
  await navigate('movies'); await page.locator('#catalog-sort').selectOption('newest');
  check('catalog can be sorted by actual year', await page.locator('#catalog-content h3').first().textContent() === 'Spider-Man: Brand New Day');
  for (const id of ['caminandes-2', 'caminandes-3']) {
    await navigate(`player?title=${id}`);
    await page.locator('.player-center-play').click();
    await page.waitForFunction(() => { const video = document.querySelector('video'); return !video.paused && video.currentTime > 1; });
    await page.locator('#player-speed').selectOption('1.5');
    check(`${id}: playback speed changes real media`, await page.locator('video').evaluate(video => video.playbackRate === 1.5));
    await page.getByRole('button', { name: 'Silenciar', exact: true }).click();
    check(`${id}: mute controls real media`, await page.locator('video').evaluate(video => video.muted));
    await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  }
  await switchTo('Administrador');
  await page.locator('[data-ops-tab="sessions"]').click();
  check('real playback produces persisted session rows', await page.locator('.session-row').count() >= 2);
  await page.getByRole('button', { name: 'Comparar', exact: true }).click();
  check('two playback sessions can be compared', await page.locator('.comparison-grid > div').count() === 4);
  await page.locator('.sessions-list .session-row').first().click();
  check('session detail includes actual timing and frame data', await page.locator('.session-facts > div').count() === 11);
  await page.keyboard.press('Escape'); await page.locator('dialog').waitFor({ state: 'detached' });
  const csvPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar sesiones CSV', exact: true }).click();
  check('administrator exports session CSV', (await csvPromise).suggestedFilename() === 'playback-sessions.csv');
  await page.reload(); await page.locator('[data-ops-tab="sessions"]').click();
  check('administrator history survives full reload', await page.locator('.sessions-list .session-row').count() >= 2);
  await page.locator('#ops-region').selectOption('JP');
  check('unobserved region produces an honest empty state', await page.locator('.sessions-list .session-row').count() === 0 && await page.locator('.ops-empty').first().isVisible());
  await page.locator('#ops-region').selectOption('all');
  await page.locator('[data-ops-tab="services"]').click();
  await page.getByRole('button', { name: 'Comprobar servicios', exact: true }).click();
  await page.getByText('Comprobaciones finalizadas.', { exact: true }).waitFor();
  check('all four local services are checked with real requests', await page.locator('.health-result.healthy').count() === 4 && await page.locator('.health-result.critical').count() === 0);
  await page.locator('[data-ops-tab="events"]').click();
  await page.locator('#event-search').fill('SERVICE_HEALTH_CHECKED');
  check('persistent event log supports meaningful search', await page.locator('.ops-event-console li').count() > 0 && (await page.locator('.ops-event-console').innerText()).includes('4/4'));
  await page.locator('[data-ops-tab="incidents"]').click();
  const previousThreshold = await page.locator('#threshold-responseMs').inputValue();
  await page.locator('#threshold-responseMs').fill('10');
  await page.getByRole('button', { name: 'Guardar umbrales', exact: true }).click();
  // Controlled transport delay exercises the real timing/alert path; production contains no seeded incident.
  const transport = await page.context().newCDPSession(page);
  await transport.send('Network.enable');
  await transport.send('Network.emulateNetworkConditions', { offline: false, latency: 180, downloadThroughput: 10000000, uploadThroughput: 10000000 });
  try {
    await page.locator('[data-ops-tab="overview"]').click();
    await page.locator('#admin-auto').uncheck();
    await page.getByRole('button', { name: 'Medir ahora', exact: true }).click();
    await page.waitForFunction(async () => { const { operationsSnapshot } = await import('/js/services/operations-store.service.js'); return operationsSnapshot().incidents.some(item => item.kind === 'response' && item.value >= 180); });
  } finally { await transport.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); await transport.detach(); }
  await page.locator('[data-ops-tab="incidents"]').click();
  check('measured slow catalog request creates a real threshold alert', await page.getByText('Respuesta lenta del catálogo', { exact: true }).count() > 0);
  await page.locator('.incident-list .session-row').filter({ hasText: 'Respuesta lenta del catálogo' }).first().click();
  await page.locator('#incident-status').selectOption('investigating');
  await page.locator('#incident-note').fill('Solicitud local medida; comprobar de nuevo después de retirar el retraso de QA.');
  await page.locator('dialog button[type="submit"]').click();
  await page.locator('dialog').waitFor({ state: 'detached' });
  await page.locator('#incident-filter').selectOption('investigating');
  check('administrator can track incident status and notes', await page.locator('.incident-list .session-row').count() >= 1);
  await page.locator('.incident-list .session-row').first().click();
  check('incident follow-up note is retained', (await page.locator('dialog blockquote').innerText()).includes('Solicitud local medida'));
  await page.locator('#incident-status').selectOption('resolved');
  await page.locator('dialog button[type="submit"]').click(); await page.locator('dialog').waitFor({ state: 'detached' });
  await page.locator('#incident-filter').selectOption('resolved');
  check('resolved incident remains available for review', await page.locator('.incident-list .session-row').count() >= 1);
  await page.locator('#threshold-responseMs').fill(previousThreshold);
  await page.getByRole('button', { name: 'Guardar umbrales', exact: true }).click();
  await page.locator('[data-ops-tab="overview"]').click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.ops-panel').first().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => !document.documentElement.classList.contains('route-transition'));
  await page.screenshot({ path: 'output/playwright/control-room-verified.png', fullPage: true });
  return { total: results.length, passed: results.filter(item => item.pass).length, failures: results.filter(item => !item.pass), errors, failedRequests };
}
