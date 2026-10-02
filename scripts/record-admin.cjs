async (page) => {
  await page.goto('http://127.0.0.1:4173/#/player?title=caminandes-2');
  await page.locator('.player-center-play').click();
  await page.waitForFunction(() => { const video = document.querySelector('video'); return video.currentTime > 1 && video.videoWidth > 0; });
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  const state = await page.context().storageState();
  const origin = state.origins.find(item => item.origin === 'http://127.0.0.1:4173');
  const preferences = origin.localStorage.find(item => item.name === 'nsip.preferences.v1');
  preferences.value = JSON.stringify({ ...JSON.parse(preferences.value), language: 'es', region: 'BO', selectedProfile: 'administrator' });
  const context = await page.context().browser().newContext({ storageState: state, viewport: { width: 1366, height: 900 }, recordVideo: { dir: 'output/playwright/recordings', size: { width: 1366, height: 900 } } });
  const preview = await context.newPage();
  const errors = [];
  preview.on('pageerror', error => errors.push(error.message));
  preview.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const settle = () => preview.waitForFunction(() => !document.documentElement.classList.contains('route-transition') && !document.querySelector('[data-animating]'));
  try {
    await preview.goto('http://127.0.0.1:4173/#/operations');
    await preview.locator('.ops-workspace').waitFor();
    await preview.locator('#admin-auto').uncheck();
    for (let index = 0; index < 3; index++) {
      await preview.getByRole('button', { name: 'Medir ahora', exact: true }).click();
      await preview.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
    }
    await settle();
    await preview.waitForTimeout(1000);
    for (const tab of ['sessions', 'incidents', 'services', 'events', 'overview']) {
      await preview.locator(`[data-ops-tab="${tab}"]`).click();
      await preview.waitForFunction(expected => document.querySelector('.ops-main').dataset.tab === expected, tab);
      await settle();
      if (tab === 'services') {
        await preview.getByRole('button', { name: 'Comprobar servicios', exact: true }).click();
        await preview.getByText('Comprobaciones finalizadas.', { exact: true }).waitFor();
      }
      if (tab === 'overview') {
        await preview.getByRole('button', { name: 'Medir ahora', exact: true }).click();
        await preview.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
        await settle();
      }
      await preview.waitForTimeout(1200);
    }
    await preview.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await preview.waitForTimeout(400);
    await preview.screenshot({ path: 'output/playwright/control-room-final.png', fullPage: false });
    const video = preview.video();
    await preview.close();
    await video.saveAs('output/playwright/admin-transitions.webm');
    return { video: 'output/playwright/admin-transitions.webm', screenshot: 'output/playwright/control-room-final.png', errors };
  } finally { await context.close(); }
}
