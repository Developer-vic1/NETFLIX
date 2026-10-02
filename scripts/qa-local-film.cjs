async (page) => {
  const results = [], errors = [], failedRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });
  const check = (name, pass) => results.push({ name, pass: !!pass });
  await page.goto('http://127.0.0.1:4173/#/home');
  await page.reload();
  if (await page.locator('.cinema-intro').count()) { await page.keyboard.press('Escape'); await page.locator('.cinema-intro').waitFor({ state: 'detached' }); }
  await page.getByRole('heading', { name: 'Tendencias', exact: true }).waitFor();
  const trend = page.locator('.catalog-section').filter({ has: page.getByRole('heading', { name: 'Tendencias', exact: true }) });
  await trend.locator('img').scrollIntoViewIfNeeded();
  await trend.locator('img').evaluate(img => img.decode());
  check('local movie appears in Trending with real poster', await trend.getByRole('heading', { name: 'Spider-Man: Brand New Day' }).count() === 1 && await trend.locator('img').evaluate(img => img.complete && img.naturalWidth > 0));
  await trend.getByRole('button', { name: 'Detalles · Spider-Man: Brand New Day', exact: true }).click();
  await page.locator('.title-information').waitFor();
  check('local movie detail exposes original single quality and hours', await page.getByRole('heading', { name: 'Spider-Man: Brand New Day', exact: true }).count() === 1 && await page.getByText('2026 · 2 h 24 min · 1080p', { exact: true }).count() === 1);
  await page.getByRole('button', { name: 'Reproducir', exact: true }).click();
  await page.locator('video').waitFor();
  await page.locator('.player-center-play').click();
  await page.waitForFunction(() => { const video = document.querySelector('video'); return video.currentTime > 1 && video.videoWidth === 1920 && !video.paused; }, null, { timeout: 60000 });
  check('original full-length movie actually decodes', await page.locator('video').evaluate(video => Math.abs(video.duration - 8678.016) < 1 && video.videoHeight === 800 && video.error === null));
  await page.locator('video').evaluate(video => { video.currentTime = 300; });
  await page.waitForFunction(() => { const video = document.querySelector('video'); return video.currentTime > 300 && video.readyState >= 3; }, null, { timeout: 45000 });
  check('large original supports seeking without truncation', await page.locator('video').evaluate(video => video.currentTime > 300 && video.error === null));
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.screenshot({ path: 'output/playwright/spiderman-playing.png', fullPage: false });
  await page.goto('http://127.0.0.1:4173/#/home');
  return { total: results.length, passed: results.filter(item => item.pass).length, failures: results.filter(item => !item.pass), errors, failedRequests };
}
