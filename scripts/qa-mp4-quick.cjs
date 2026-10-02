async (page)=>{
 const context=await page.context().browser().newContext(),current=await context.newPage();
 try{
  await current.goto('http://127.0.0.1:4173/#/profiles');
  await current.locator('.profile-select').filter({hasText:'Administrador'}).click();
  await current.locator('[data-ops-tab="library"]').click();
  const initiallyClosed=await current.locator('#film-name').count()===0;
  await current.getByRole('button',{name:'Añadir película',exact:true}).click();
  const addOpened=await current.locator('#film-name').count()===1&&await current.locator('#film-name').evaluate(node=>document.activeElement===node);
  await current.getByRole('button',{name:'Guardar y publicar',exact:true}).click();
  const missingFields=await current.locator('.library-fields > .library-inline-feedback').textContent();
  const accept=await current.locator('#film-video').getAttribute('accept');
  await current.locator('#film-video').setInputFiles({name:'falso.mp4',mimeType:'video/mp4',buffer:Buffer.from('contenido que no es MP4')});
  await current.locator('.library-upload .library-inline-feedback').first().filter({hasText:'El archivo no contiene un contenedor MP4 válido. Revisa el original; cambiar la extensión no lo convierte.'}).waitFor({timeoutMs:4000});
  const fake=await current.locator('.library-status').textContent();
  await current.locator('#film-video').scrollIntoViewIfNeeded();
  await current.screenshot({path:'output/playwright/mp4-validation-message.png'});
  await current.locator('#film-video').setInputFiles({name:'falso.webm',mimeType:'video/webm',buffer:Buffer.from('webm')});
  await current.locator('.library-upload .library-inline-feedback').first().filter({hasText:'Solo se aceptan archivos .mp4. Selecciona un video MP4 válido.'}).waitFor({timeoutMs:4000});
  const wrongExtension=await current.locator('.library-status').textContent();
  await current.locator('#film-video').setInputFiles('assets/videos/caminandes-2-360p.mp4');
  await current.locator('.library-status').filter({hasText:'Video validado. Revisa la vista previa antes de guardarlo.'}).waitFor({timeoutMs:30000});
  await current.locator('#film-name').fill('Archivo de control');
  await current.locator('#film-description').fill('Archivo MP4 completo para comprobar publicación y retirada.');
  await current.locator('#film-creator').fill('Blender Studio');
  await current.locator('#film-genre').fill('Animación');
  await current.getByRole('button',{name:'Guardar y publicar',exact:true}).click();
  const missingCover=await current.locator('.library-upload .library-inline-feedback').last().textContent();
  await current.locator('#film-cover').setInputFiles('assets/posters/caminandes-2.webp');
  await current.locator('.library-cover').waitFor({state:'visible'});
  await current.getByRole('button',{name:'Guardar y publicar',exact:true}).click();
  await current.getByText('Película guardada y disponible en Películas, búsqueda y reproducción.',{exact:true}).waitFor({timeoutMs:10000});
  const published=await current.locator('.library-record').textContent();
  const summary=await current.locator('.library-summary').textContent();
  await current.locator('#library-search').fill('Animación');
  const searched=await current.locator('.library-record').count();
  await current.locator('#library-filter').selectOption('draft');
  const filtered=await current.locator('.library-record').count();
  await current.locator('#library-filter').selectOption('all');
  await current.locator('#library-search').fill('');
  await current.locator('.library-record').getByRole('button',{name:'Retirar del catálogo',exact:true}).click();
  await current.getByText('Borrador guardado. Solo aparece en esta biblioteca del administrador.',{exact:true}).waitFor({timeoutMs:10000});
  const withdrawn=await current.locator('.library-record').textContent();
  await current.locator('.library-record').getByRole('button',{name:'Publicar',exact:true}).click();
  await current.getByText('Película guardada y disponible en Películas, búsqueda y reproducción.',{exact:true}).waitFor({timeoutMs:10000});
  const republished=await current.locator('.library-record').textContent();
  await current.reload();await current.locator('[data-ops-tab="library"]').click();
  const persisted=await current.locator('.library-record').textContent();
  await current.waitForTimeout(1800);
  await current.locator('#library-search').scrollIntoViewIfNeeded();
  await current.screenshot({path:'output/playwright/mp4-library.png'});
  const checks={
   addOpensForm:initiallyClosed&&addOpened,
   missingFieldMessage:missingFields.includes('Revisa los campos obligatorios'),
   mp4Picker:accept==='video/mp4,.mp4',
   fakeRejected:fake.includes('contenedor MP4 válido'),
   webmRejected:wrongExtension.includes('Solo se aceptan archivos .mp4'),
   missingCoverMessage:missingCover.includes('Selecciona una portada'),
   published:published.includes('En el catálogo'),
   withdrawn:withdrawn.includes('Borrador'),
   republished:republished.includes('En el catálogo'),
   persisted:persisted.includes('En el catálogo'),
   actualCounts:summary.includes('1 película')&&summary.includes('1 publicada'),
   genreSearch:searched===1,
   draftFilter:filtered===0,
  };
  if(Object.values(checks).some(value=>!value))throw new Error(JSON.stringify(checks));
  return {checks,summary};
 }finally{await context.close()}
}
