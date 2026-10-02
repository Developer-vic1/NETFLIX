async (page) => {
 const context = await page.context().browser().newContext({viewport:{width:849,height:858}}), current = await context.newPage(), errors=[];
 current.on('pageerror', e=>errors.push(e.message));
 try {
 await current.goto('http://127.0.0.1:4173/#/profiles');
 await current.locator('.profile-select').filter({hasText:'Administrador'}).click();
 await current.locator('[data-ops-tab="events"]').click();
 await current.getByRole('heading',{name:'Historial de actividad',exact:true}).waitFor();
 const readable=await current.locator('.activity-content strong').allTextContents();
 await current.locator('#event-category').selectOption('downloads');
 const empty=await current.locator('.activity-empty').count()===1;
 await current.locator('#event-category').selectOption('all');
 await current.locator('#event-search').fill('Sección');
 const search=await current.locator('.activity-row').count()>0;
 await current.locator('.activity-details summary').first().click();
 const details=await current.locator('.activity-details[open] code').first().isVisible();
 await current.locator('#event-search').fill('');
 await current.locator('.activity-details[open] summary').first().click();
 await current.locator('.ops-tab-panel:not([hidden])').evaluate(node=>Promise.all(node.getAnimations().map(a=>a.finished)));
 await current.evaluate(()=>window.scrollTo(0,0));
 await current.screenshot({path:'output/playwright/activity-history.png'});
 await current.setViewportSize({width:390,height:844});
 const mobile=await current.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
 return {readable,empty,search,details,mobile,errors};
 } finally {await context.close();}
}
