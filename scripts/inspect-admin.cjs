async (page) => {
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('nsip.preferences.v1') || '{}');
    localStorage.setItem('nsip.preferences.v1', JSON.stringify({ ...saved, selectedProfile: 'administrator' }));
  });
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.ops-workspace'));
  return { errors, charts: await page.locator('canvas').count(), maps: await page.locator('#world-map svg').count() };
}
