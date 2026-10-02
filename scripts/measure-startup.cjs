async (page) => {
  const context = await page.context().browser().newContext();
  const measured = await context.newPage();
  const errors = [];
  measured.on('pageerror', error => errors.push(error.message));
  const runs = [];
  for (const label of ['cold', 'warm']) {
    if (label === 'cold') await measured.goto('http://127.0.0.1:4173/#/home', { waitUntil: 'domcontentloaded' });
    else await measured.reload({ waitUntil: 'domcontentloaded' });
    await measured.waitForFunction(() => document.querySelector('.hero-image') && !document.getElementById('app').inert && !document.querySelector('.cinema-intro'));
    const interactiveMs = await measured.evaluate(() => performance.now());
    await measured.waitForFunction(() => document.querySelector('.hero-image')?.naturalWidth > 0);
    runs.push(await measured.evaluate(({label, interactiveMs}) => ({
      label, interactiveMs: Math.round(interactiveMs), heroReadyMs: Math.round(performance.now()),
      domContentLoadedMs: Math.round(performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd),
      resourceCount: performance.getEntriesByType('resource').length,
      hero: performance.getEntriesByType('resource').filter(e => /backgrounds\/sintel/.test(e.name)).map(e => ({bytes:e.encodedBodySize, durationMs:Math.round(e.duration)})),
    }), {label, interactiveMs}));
    await measured.evaluate(() => navigator.serviceWorker.ready);
  }

  await context.close();
  return {runs, errors};
}
