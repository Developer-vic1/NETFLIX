import fs from 'node:fs';
const rows = {
'operations.events':['Historial de actividad','Activity history','Cronologia delle attività','سجل النشاط'],
'ops.searchEvents':['Buscar por actividad o título','Search activity or title','Cerca attività o titolo','البحث عن نشاط أو عنوان'],
'activity.help':['Consulta qué ocurrió y cuándo. Las novedades aparecen primero; abre los detalles para ver el registro técnico.','See what happened and when. Newest first; expand details for the technical record.','Consulta cosa è successo e quando. Le attività più recenti appaiono per prime; apri i dettagli per il registro tecnico.','اعرض ما حدث ووقت حدوثه. تظهر أحدث الأنشطة أولاً؛ افتح التفاصيل لعرض السجل التقني.'],
'activity.all':['Toda la actividad','All activity','Tutte le attività','كل الأنشطة'],
'activity.playback':['Reproducción','Playback','Riproduzione','التشغيل'],
'activity.downloads':['Descargas','Downloads','Download','التنزيلات'],
'activity.account':['Perfiles y preferencias','Profiles and preferences','Profili e preferenze','الملفات الشخصية والتفضيلات'],
'activity.system':['Sistema y servicios','System and services','Sistema e servizi','النظام والخدمات'],
'activity.filter':['Tipo de actividad','Activity type','Tipo di attività','نوع النشاط'],
'activity.results':['actividades encontradas','activities found','attività trovate','أنشطة تم العثور عليها'],
'activity.technical':['Ver detalles técnicos','View technical details','Visualizza dettagli tecnici','عرض التفاصيل التقنية'],
'activity.empty':['No hay actividad con estos filtros.','No activity matches these filters.','Nessuna attività corrisponde a questi filtri.','لا توجد أنشطة تطابق هذه الفلاتر.'],
'activity.generic':['Actividad del sistema','System activity','Attività del sistema','نشاط النظام'],
'activity.PLAY_STARTED':['Reproducción iniciada','Playback started','Riproduzione avviata','بدأ التشغيل'],
'activity.PLAY_PAUSED':['Reproducción en pausa','Playback paused','Riproduzione in pausa','تم إيقاف التشغيل مؤقتاً'],
'activity.PLAY_ENDED':['Reproducción finalizada','Playback ended','Riproduzione terminata','انتهى التشغيل'],
'activity.BUFFERING_STARTED':['El video está cargando','Video is buffering','Caricamento del video','جارٍ تحميل الفيديو'],
'activity.QUALITY_CHANGED':['Calidad de video actualizada','Video quality updated','Qualità video aggiornata','تم تحديث جودة الفيديو'],
'activity.PLAYBACK_SPEED_CHANGED':['Velocidad de reproducción actualizada','Playback speed updated','Velocità di riproduzione aggiornata','تم تحديث سرعة التشغيل'],
'activity.DOWNLOAD_COMPLETED':['Descarga completada','Download completed','Download completato','اكتمل التنزيل'],
'activity.DOWNLOAD_FAILED':['No se pudo descargar el título','Title download failed','Download del titolo non riuscito','تعذر تنزيل العنوان'],
'activity.DOWNLOAD_REMOVED':['Descarga eliminada','Download removed','Download eliminato','تم حذف التنزيل'],
'activity.PROFILE_CHANGED':['Perfil seleccionado','Profile selected','Profilo selezionato','تم اختيار الملف الشخصي'],
'activity.LOCALIZATION_CHANGED':['Región e idioma actualizados','Region and language updated','Regione e lingua aggiornate','تم تحديث المنطقة واللغة'],
'activity.MY_LIST_CHANGED':['Mi lista actualizada','My list updated','La mia lista aggiornata','تم تحديث قائمتي'],
'activity.TITLE_RATED':['Valoración guardada','Rating saved','Valutazione salvata','تم حفظ التقييم'],
'activity.HOME_LOADED':['Inicio abierto','Home opened','Pagina iniziale aperta','تم فتح الصفحة الرئيسية'],
'activity.OPERATIONS_SECTION_OPENED':['Sección del centro operativo abierta','Operations section opened','Sezione operativa aperta','تم فتح قسم العمليات'],
'activity.WORKSPACE_UPDATED':['Registros actualizados','Records updated','Record aggiornati','تم تحديث السجلات'],
'activity.CATALOG_RESPONSE_MEASURED':['Respuesta del catálogo comprobada','Catalog response measured','Risposta del catalogo verificata','تم قياس استجابة الكتالوج'],
'activity.CATALOG_RESPONSE_FAILED':['El catálogo no respondió','Catalog response failed','Il catalogo non ha risposto','لم يستجب الكتالوج'],
'activity.SERVICE_HEALTH_CHECKED':['Comprobación de servicios finalizada','Service check completed','Verifica dei servizi completata','اكتمل فحص الخدمات']
};
for(const [index,lang] of ['es','en','it','ar'].entries()) {
 const path=`locales/${lang}.js`;let source=fs.readFileSync(path,'utf8');
 for(const [key,values] of Object.entries(rows)) {
 const line=`  ${JSON.stringify(key)}: ${JSON.stringify(values[index])},`;
 const pattern=new RegExp('  '+JSON.stringify(key).replaceAll('.','\\.')+':[^\\n]*');
 if(source.includes(JSON.stringify(key)+':')) source=source.replace(pattern,line);
 else source=source.replace(/\n};\s*$/,`\n${line}\n};\n`);
 }
 fs.writeFileSync(path,source);
}
