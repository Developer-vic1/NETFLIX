async (page) => {
  const context = await page.context().browser().newContext();
  const current = await context.newPage();
  const results = [], errors = [];
  current.on('pageerror', error => errors.push(error.message));
  const check = (name, pass, evidence) => results.push({name, pass:!!pass, ...(evidence ? {evidence} : {})});
  try {
    await current.goto('http://127.0.0.1:4173/#/player?title=caminandes-2');
    await current.locator('.playback-settings summary').click();
    check('settings collapse without leaving playback', !(await current.locator('#player-speed').isVisible()));
    await current.getByRole('button', {name:'Ajustes del reproductor', exact:true}).click();
    check('settings shortcut opens panel and focuses quality', await current.locator('#player-quality').isVisible() && await current.locator('#player-quality').evaluate(node => node === document.activeElement));
    await current.locator('.player-center-play').click();
    await current.waitForFunction(() => document.querySelector('video').currentTime > .5);
    await current.locator('.player-toggle').click();
    await current.locator('#player-speed').selectOption('1.5');
    await current.locator('input[aria-label="Volumen"]').fill('35');
    await current.getByRole('button', {name:'Guardar preferencias', exact:true}).click();
    await current.reload();
    check('saved speed and volume survive reload', await current.locator('video').evaluate(video => video.playbackRate === 1.5 && Math.abs(video.volume - .35) < .001));
    await current.locator('.player-center-play').click();
    await current.waitForFunction(() => !document.querySelector('video').paused);
    await current.locator('#app').focus();
    await current.waitForFunction(() => document.querySelector('.player-shell').dataset.controls === 'hidden');
    await current.waitForFunction(() => Number(getComputedStyle(document.querySelector('.player-controls')).opacity) < .1);
    check('playing hides idle controls', await current.locator('.player-controls').evaluate(node => Number(getComputedStyle(node).opacity) < .1));
    await current.keyboard.press('l');
    check('keyboard reveals hidden controls', await current.locator('.player-shell').getAttribute('data-controls') === 'visible');
    await current.keyboard.press('k');
    check('pausing keeps controls visible and a single play button', await current.locator('video').evaluate(video => video.paused) && await current.locator('.player-toggle').getAttribute('aria-label') === 'Reproducir');
    for (const language of ['es', 'en', 'it', 'ar']) {
      await current.evaluate(code => {
        const key = 'nsip.preferences.v1';
        localStorage.setItem(key, JSON.stringify({...JSON.parse(localStorage.getItem(key)||'{}'), language:code}));
      }, language);
      await current.reload();
      for (const [width,height] of [[320,740],[390,844],[768,1024],[1024,768],[1366,900],[1920,1080]]) {
        await current.setViewportSize({width,height});
        const evidence = await current.evaluate(() => {
          const nodes = [...document.querySelectorAll('.watch-page button, .watch-page select, .watch-page input, .watch-page summary')].filter(node => node.getClientRects().length);
          const width = innerWidth;
          return {overflow:document.documentElement.scrollWidth > width+1, clipped:nodes.filter(node => {const rect=node.getBoundingClientRect(); return rect.left < -1 || rect.right > width+1;}).map(node => node.id || node.getAttribute('aria-label') || node.textContent), dir:document.documentElement.dir};
        });
        check(`${language} distribution at ${width}px`, !evidence.overflow && evidence.clipped.length === 0 && evidence.dir === (language === 'ar'?'rtl':'ltr'), evidence);
        if (width === 390 && language === 'es') {
          await current.evaluate(() => scrollTo(0,0));
          await current.screenshot({path:'output/playwright/player-distribution-mobile.png', fullPage:true});
        }
      }
    }
    return {total:results.length, passed:results.filter(item=>item.pass).length, failures:results.filter(item=>!item.pass), errors};
  } finally {await context.close();}
}
