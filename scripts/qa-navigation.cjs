async (page) => {
  const context = await page.context().browser().newContext();
  const current = await context.newPage();
  const results = [], errors = [];
  current.on('pageerror', error => errors.push(error.message));
  const check = (name, pass, evidence) => results.push({name, pass:!!pass, ...(evidence ? {evidence} : {})});
  const open = async () => {
    await current.locator('.menu-toggle').click();
    await current.locator('#navigation-drawer').waitFor();
    await current.locator('#navigation-drawer').evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
  };
  try {
    await current.setViewportSize({width:849,height:858});
    await current.goto('http://127.0.0.1:4173/#/series');
    await open();
    check('active page is marked in compact menu', await current.locator('.drawer-link[aria-current="page"]').getAttribute('href') === '#/series');
    const home = current.locator('.drawer-link[href="#/home"]');
    await home.focus();
    await current.keyboard.press('ArrowDown');
    check('Down focuses next route', await current.locator('.drawer-link[href="#/series"]').evaluate(node => node === document.activeElement));
    await current.keyboard.press('End');
    check('End focuses last option', await current.locator('.drawer-link[href="#/account"]').evaluate(node => node === document.activeElement));
    await current.keyboard.press('Tab');
    check('Tab stays inside modal', await current.locator('#navigation-drawer').evaluate(node => node.contains(document.activeElement)));
    await current.keyboard.press('Escape');
    await current.locator('#navigation-drawer').waitFor({state:'detached'});
    check('Escape closes and restores menu focus', await current.locator('.menu-toggle').evaluate(node => node === document.activeElement && node.getAttribute('aria-expanded') === 'false'));
    await open();
    await current.locator('.drawer-link[href="#/series"]').click();
    await current.locator('#navigation-drawer').waitFor({state:'detached'});
    check('current route link also closes menu', await current.locator('#app').getAttribute('data-route') === 'series');
    await open();
    await current.locator('.drawer-link[href="#/movies"]').click();
    await current.waitForFunction(() => document.getElementById('app').dataset.route === 'movies');
    check('link navigates and closes menu', await current.locator('#navigation-drawer').count() === 0);
    await open();
    await current.mouse.click(20,120);
    await current.locator('#navigation-drawer').waitFor({state:'detached'});
    check('backdrop closes menu', await current.locator('.menu-toggle').getAttribute('aria-expanded') === 'false');
    for (const language of ['es','en','it','ar']) {
      await current.evaluate(code => {
        const key='nsip.preferences.v1';
        localStorage.setItem(key, JSON.stringify({...JSON.parse(localStorage.getItem(key)||'{}'), language:code}));
      }, language);
      await current.reload();
      for (const [width,height] of [[320,740],[390,844],[849,858],[1024,768]]) {
        await current.setViewportSize({width,height});
        await open();
        const evidence = await current.locator('#navigation-drawer').evaluate(node => {
          const rect=node.getBoundingClientRect();
          const links=[...node.querySelectorAll('.drawer-link')];
          return {width:rect.width, left:rect.left, right:rect.right, viewport:innerWidth, heights:links.map(link=>link.getBoundingClientRect().height), overflow:node.scrollWidth > node.clientWidth+1, dir:document.documentElement.dir};
        });
        check(`${language} compact drawer at ${width}px`, evidence.width <= 305 && evidence.left >= -1 && evidence.right <= width+1 && !evidence.overflow && evidence.heights.every(height=>height>=44 && height<=60) && evidence.dir === (language==='ar'?'rtl':'ltr'), evidence);
        if (language==='es' && width===849) await current.screenshot({path:'output/playwright/navigation-849.png'});
        if (language==='es' && width===320) await current.screenshot({path:'output/playwright/navigation-320.png'});
        await current.keyboard.press('Escape');
        await current.locator('#navigation-drawer').waitFor({state:'detached'});
      }
    }
    await current.evaluate(() => {
      const key='nsip.preferences.v1';
      localStorage.setItem(key, JSON.stringify({...JSON.parse(localStorage.getItem(key)||'{}'), selectedProfile:'administrator', language:'es'}));
    });
    await current.reload();
    await open();
    check('administrator retains operations access', await current.locator('.drawer-link[href="#/operations"]').count() === 1);
    return {total:results.length, passed:results.filter(item=>item.pass).length, failures:results.filter(item=>!item.pass), errors};
  } finally {await context.close();}
}
