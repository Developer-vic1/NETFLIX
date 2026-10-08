import { getLocalization } from "../services/localization.service.js";
import { formatTime } from "../utils/time.js";

const messages = {
  es: {
    title: "Centro de cargas", subtitle: "Tus archivos completos, paso a paso", queued: "En cola",
    validating: "Verificando MP4", uploading: "Copiando video al equipo", confirming: "Confirmando el archivo", saving: "Guardando la ficha",
    ready: "Carga completada", error: "La carga necesita atención", cancelled: "Carga cancelada", cancelling: "Cancelando la carga…",
    cancel: "Cancelar carga", retry: "Reintentar", dismiss: "Cerrar seguimiento", background: "Continuar en segundo plano", view: "Ver progreso",
    keepOpen: "Puedes cambiar de pantalla dentro de la aplicación. Mantén esta pestaña abierta hasta finalizar.",
    bytes: "{sent} de {total} enviados", speed: "Velocidad", elapsed: "Tiempo transcurrido", remaining: "Tiempo restante aprox.", estimating: "Calculando…",
    file: "Archivo {index} de {count}", empty: "No hay cargas en esta sesión.", active: "Cargas en curso", notificationDone: "{name} se incorporó a la biblioteca.",
    notificationFailed: "No se completó la carga de {name}.", notificationCancelled: "Cancelaste la carga de {name}.",
    errorNetwork: "No se pudo contactar al servidor local. Comprueba que esté abierto y reintenta.",
    errorSpace: "No hay espacio suficiente en el equipo o en el navegador. Libera espacio y reintenta.",
    errorFile: "Este archivo no es un MP4 válido. Selecciona otro archivo en la biblioteca.",
    errorLarge: "El límite por archivo es 15 GiB. Selecciona un MP4 dentro del límite.",
    errorSave: "No se pudo completar el guardado. Tus archivos siguen disponibles para reintentar en esta sesión.",
    cancelledHint: "La ficha no se publicó. Al reintentar se reutilizan los episodios que ya terminaron de copiarse.",
    readyHint: "El archivo completo y la ficha se guardaron correctamente.", receivedHint: "Los bytes enviados llegaron al 100 %. Esperando la confirmación del guardado.",
    inspect: "Leyendo duración, resolución y primer fotograma…", stopInspect: "Cancelar validación", sort: "Ordenar biblioteca", recent: "Última actualización", name: "Título A–Z", year: "Año más reciente", size: "Mayor tamaño", kind: "Tipo de contenido", allKinds: "Películas y series", movie: "Películas", series: "Series", previous: "Mover antes", next: "Mover después",
  },
  en: {
    title: "Upload center", subtitle: "Your complete files, step by step", queued: "Queued",
    validating: "Checking MP4", uploading: "Copying video to this computer", confirming: "Confirming the file", saving: "Saving the catalog entry",
    ready: "Upload complete", error: "Upload needs attention", cancelled: "Upload cancelled", cancelling: "Cancelling upload…",
    cancel: "Cancel upload", retry: "Retry", dismiss: "Dismiss", background: "Continue in background", view: "View progress",
    keepOpen: "You can navigate within the app. Keep this tab open until the upload finishes.",
    bytes: "{sent} of {total} sent", speed: "Speed", elapsed: "Elapsed time", remaining: "Approx. time remaining", estimating: "Calculating…",
    file: "File {index} of {count}", empty: "No uploads in this session.", active: "Uploads in progress", notificationDone: "{name} was added to the library.",
    notificationFailed: "The upload of {name} did not finish.", notificationCancelled: "You cancelled the upload of {name}.",
    errorNetwork: "Could not reach the local server. Make sure it is running and retry.", errorSpace: "Not enough space on this computer or in the browser. Free some space and retry.",
    errorFile: "This file is not a valid MP4. Choose another file in the library.", errorLarge: "The limit is 15 GiB per file. Choose an MP4 within that limit.",
    errorSave: "Could not finish saving. Your files remain available for retry during this session.",
    cancelledHint: "The entry was not published. A retry reuses episodes that were already copied.", readyHint: "The complete file and catalog entry were saved successfully.", receivedHint: "All bytes were sent. Waiting for confirmation that the file was saved.",
    inspect: "Reading duration, resolution and the first frame…", stopInspect: "Cancel validation", sort: "Sort library", recent: "Last updated", name: "Title A–Z", year: "Newest year", size: "Largest file", kind: "Content type", allKinds: "Films and series", movie: "Films", series: "Series", previous: "Move earlier", next: "Move later",
  },
  it: {
    title: "Centro caricamenti", subtitle: "I tuoi file completi, passo dopo passo", queued: "In coda",
    validating: "Verifica del file MP4", uploading: "Copia del video sul computer", confirming: "Conferma del file", saving: "Salvataggio della scheda",
    ready: "Caricamento completato", error: "Il caricamento richiede attenzione", cancelled: "Caricamento annullato", cancelling: "Annullamento del caricamento…",
    cancel: "Annulla caricamento", retry: "Riprova", dismiss: "Chiudi monitoraggio", background: "Continua in background", view: "Mostra avanzamento",
    keepOpen: "Puoi navigare nell'applicazione. Mantieni aperta questa scheda fino al termine del caricamento.",
    bytes: "{sent} di {total} inviati", speed: "Velocità", elapsed: "Tempo trascorso", remaining: "Tempo rimanente approssimativo", estimating: "Calcolo in corso…",
    file: "File {index} di {count}", empty: "Nessun caricamento in questa sessione.", active: "Caricamenti in corso", notificationDone: "{name} è stato aggiunto alla libreria.",
    notificationFailed: "Il caricamento di {name} non è stato completato.", notificationCancelled: "Hai annullato il caricamento di {name}.",
    errorNetwork: "Impossibile contattare il server locale. Verifica che sia in esecuzione e riprova.", errorSpace: "Spazio insufficiente sul computer o nel browser. Libera spazio e riprova.",
    errorFile: "Questo file non è un MP4 valido. Seleziona un altro file nella libreria.", errorLarge: "Il limite è di 15 GiB per file. Seleziona un MP4 entro questo limite.",
    errorSave: "Impossibile completare il salvataggio. Puoi riprovare con i tuoi file durante questa sessione.",
    cancelledHint: "La scheda non è stata pubblicata. Un nuovo tentativo riutilizza gli episodi già copiati.", readyHint: "Il file completo e la scheda sono stati salvati correttamente.", receivedHint: "Tutti i byte sono stati inviati. In attesa della conferma del salvataggio.",
    inspect: "Lettura della durata, della risoluzione e del primo fotogramma…", stopInspect: "Annulla verifica", sort: "Ordina libreria", recent: "Ultimo aggiornamento", name: "Titolo A–Z", year: "Anno più recente", size: "Dimensione maggiore", kind: "Tipo di contenuto", allKinds: "Film e serie", movie: "Film", series: "Serie", previous: "Sposta prima", next: "Sposta dopo",
  },
  ar: {
    title: "مركز التحميل", subtitle: "ملفاتك كاملة خطوة بخطوة", queued: "في قائمة الانتظار", validating: "التحقق من MP4", uploading: "نسخ الفيديو إلى الكمبيوتر", confirming: "تأكيد الملف", saving: "حفظ البيانات",
    ready: "اكتمل التحميل", error: "التحميل يحتاج إلى متابعة", cancelled: "أُلغي التحميل", cancelling: "جارٍ إلغاء التحميل…", cancel: "إلغاء التحميل", retry: "إعادة المحاولة", dismiss: "إغلاق المتابعة", background: "المتابعة في الخلفية", view: "عرض التقدم",
    keepOpen: "يمكنك التنقل داخل التطبيق. أبقِ هذه الصفحة مفتوحة حتى انتهاء التحميل.", bytes: "أُرسل {sent} من {total}", speed: "السرعة", elapsed: "الوقت المنقضي", remaining: "الوقت المتبقي التقريبي", estimating: "جارٍ الحساب…", file: "الملف {index} من {count}", empty: "لا توجد عمليات تحميل في هذه الجلسة.", active: "عمليات التحميل الجارية",
    notificationDone: "أُضيف {name} إلى المكتبة.", notificationFailed: "لم يكتمل تحميل {name}.", notificationCancelled: "ألغيت تحميل {name}.", errorNetwork: "تعذر الاتصال بالخادم المحلي. تأكد من تشغيله وحاول مجددًا.", errorSpace: "مساحة غير كافية على الكمبيوتر أو في المتصفح. أفرغ مساحة وحاول مجددًا.", errorFile: "هذا الملف ليس MP4 صالحًا. اختر ملفًا آخر من المكتبة.", errorLarge: "الحد الأقصى هو 15 GiB لكل ملف. اختر ملف MP4 ضمن الحد.", errorSave: "تعذر إكمال الحفظ. يمكنك إعادة المحاولة باستخدام الملفات خلال هذه الجلسة.", cancelledHint: "لم تُنشر البيانات. تُستخدم الحلقات المنسوخة سابقًا عند إعادة المحاولة.", readyHint: "حُفظ الملف الكامل وبياناته بنجاح.", receivedHint: "أُرسلت جميع البيانات. في انتظار تأكيد حفظ الملف.", inspect: "جارٍ قراءة المدة والدقة والإطار الأول…", stopInspect: "إلغاء التحقق", sort: "ترتيب المكتبة", recent: "آخر تحديث", name: "العنوان", year: "السنة الأحدث", size: "الحجم الأكبر", kind: "نوع المحتوى", allKinds: "أفلام ومسلسلات", movie: "أفلام", series: "مسلسلات", previous: "نقل إلى السابق", next: "نقل إلى التالي",
  },
};
const localImport = {
  es: { choose: "Elegir MP4 del equipo", path: "Ruta del archivo original", usePath: "Usar esta ruta", choosing: "Selecciona el MP4 en la ventana de Windows…", moveStorage: "Al guardar se mueve el original a Netflix/videos/título.mp4 o Netflix/series/título_#capítulo.mp4. No se sobrescriben archivos existentes.", sourceHint: "Elige el original o pega su ruta completa. Se trasladará al guardar; la selección todavía no mueve nada.", uploading: "Trasladando video a Netflix", bytes: "{sent} de {total} procesados", errorDestination: "Ya existe un archivo con ese título y capítulo. Cambia el título/número o selecciona el archivo que ya está en Netflix.", errorSource: "El original no está disponible o cambió desde que lo elegiste. Vuelve a seleccionarlo.", errorPermission: "Windows no permitió mover el archivo. Cierra programas que lo estén usando y revisa los permisos de la carpeta.", errorBusy: "Ese archivo ya se está trasladando. Espera a que termine la carga actual.", cancelledHint: "La ficha no se publicó. Los capítulos que ya se trasladaron quedan en Netflix y se reutilizan al reintentar en esta sesión.", receivedHint: "El archivo ya se trasladó. Confirmando el guardado de la ficha.", readyHint: "El video íntegro quedó organizado en Netflix y su ficha se guardó correctamente." },
  en: { choose: "Choose MP4 on this computer", path: "Original file path", usePath: "Use this path", choosing: "Choose the MP4 in the Windows dialog…", moveStorage: "Saving moves the original to Netflix/videos/title.mp4 or Netflix/series/title_#episode.mp4. Existing files are never overwritten.", sourceHint: "Choose the original or paste its full path. It moves only when you save.", uploading: "Moving video to Netflix", bytes: "{sent} of {total} processed", errorDestination: "A file already uses this title and episode. Change the title/number or choose the existing file in Netflix.", errorSource: "The original is unavailable or changed after selection. Choose it again.", errorPermission: "Windows could not move this file. Close programs using it and check folder permissions.", errorBusy: "This file is already being moved. Wait for the current upload to finish.", cancelledHint: "The entry was not published. Episodes already moved remain in Netflix and are reused when you retry in this session.", receivedHint: "The file has been moved. Confirming the catalog entry.", readyHint: "The complete video is organized in Netflix and its entry was saved." },
  it: { choose: "Scegli un MP4 sul computer", path: "Percorso del file originale", usePath: "Usa questo percorso", choosing: "Scegli il file MP4 nella finestra di Windows…", moveStorage: "Il salvataggio sposta l'originale in Netflix/videos/titolo.mp4 o Netflix/series/titolo_#episodio.mp4. I file esistenti non vengono sovrascritti.", sourceHint: "Scegli l'originale o incolla il percorso completo. Il file viene spostato solo al salvataggio.", uploading: "Spostamento del video in Netflix", bytes: "{sent} di {total} elaborati", errorDestination: "Esiste già un file con questo titolo e numero di episodio. Modifica il titolo/numero o scegli il file già presente in Netflix.", errorSource: "L'originale non è disponibile o è cambiato dopo la selezione. Selezionalo di nuovo.", errorPermission: "Windows non ha consentito lo spostamento. Chiudi i programmi che usano il file e verifica i permessi della cartella.", errorBusy: "Il file è già in fase di spostamento. Attendi il termine del caricamento attuale.", cancelledHint: "La scheda non è stata pubblicata. Gli episodi già spostati restano in Netflix e vengono riutilizzati se riprovi in questa sessione.", receivedHint: "Il file è stato spostato. Conferma del salvataggio della scheda.", readyHint: "Il video completo è organizzato in Netflix e la scheda è stata salvata." },
  ar: { choose: "اختيار MP4 من الكمبيوتر", path: "مسار الملف الأصلي", usePath: "استخدام هذا المسار", choosing: "اختر MP4 من نافذة Windows…", moveStorage: "يُنقل الأصل عند الحفظ إلى Netflix/videos أو Netflix/series بعنوانه ورقم الحلقة. لا تُستبدل الملفات الموجودة.", sourceHint: "اختر الملف الأصلي أو الصق مساره الكامل. لا يُنقل إلا عند الحفظ.", uploading: "نقل الفيديو إلى Netflix", bytes: "عولج {sent} من {total}", errorDestination: "يوجد ملف بهذا العنوان ورقم الحلقة. غيّر العنوان أو الرقم أو اختر الملف الموجود.", errorSource: "الأصل غير متاح أو تغيّر بعد اختياره. اختره مجددًا.", errorPermission: "لم يسمح Windows بنقل الملف. أغلق البرامج التي تستخدمه وتحقق من أذونات المجلد.", errorBusy: "يُنقل هذا الملف بالفعل. انتظر انتهاء العملية الحالية.", cancelledHint: "لم تُنشر البيانات. تبقى الحلقات المنقولة في Netflix وتُستخدم عند إعادة المحاولة في هذه الجلسة.", receivedHint: "نُقل الملف. جارٍ تأكيد حفظ بياناته.", readyHint: "أصبح الفيديو الكامل منظمًا في Netflix وحُفظت بياناته." },
};
const diskMessages = {
  es: { errorServerOutdated: "Reinicia Netflix o el servidor local para guardar la ficha en el equipo.", errorCatalog: "No se pudo guardar la ficha en el equipo. Comprueba el servidor y los permisos de data/library, y reintenta." },
  en: { errorServerOutdated: "Restart Netflix or the local server to save the library entry on this computer.", errorCatalog: "Could not save the entry on this computer. Check the server and data/library permissions, then retry." },
  it: { errorServerOutdated: "Riavvia Netflix o il server locale per salvare la scheda sul computer.", errorCatalog: "Impossibile salvare la scheda sul computer. Verifica il server e i permessi di data/library, poi riprova." },
  ar: { errorServerOutdated: "أعد تشغيل Netflix أو الخادم المحلي لحفظ البيانات على الكمبيوتر.", errorCatalog: "تعذر حفظ البيانات على الكمبيوتر. تحقق من الخادم وأذونات data/library ثم حاول مجددًا." },
};
export function transferText(key, params = {}) {
  const language = getLocalization().language;
  const value = (diskMessages[language] || diskMessages.en)[key] || (localImport[language] || localImport.en)[key] || (messages[language] || messages.en)[key] || messages.en[key] || key;
  return value.replace(/\{(\w+)\}/g, (match, name) => params[name] == null ? match : String(params[name]));
}
export function transferError(code) {
  if (code === "library.serverOutdated") return transferText("errorServerOutdated");
  if (code === "library.catalogUnavailable") return transferText("errorCatalog");
  return transferText(({ "library.serverUnavailable": "errorNetwork", "library.spaceError": "errorSpace", "library.mp4Invalid": "errorFile", "library.mp4Required": "errorFile", "library.videoTooLarge": "errorLarge", "library.destinationExists": "errorDestination", "library.sourceUnavailable": "errorSource", "library.sourceChanged": "errorSource", "library.permissionDenied": "errorPermission", "library.importBusy": "errorBusy" })[code] || "errorSave");
}
export function formatBytes(bytes) {
  const amount = Math.max(0, Number(bytes) || 0);
  const unit = amount >= 1024 ** 3 ? 3 : amount >= 1024 ** 2 ? 2 : amount >= 1024 ? 1 : 0;
  return `${new Intl.NumberFormat(getLocalization().language, { maximumFractionDigits: 1 }).format(amount / 1024 ** unit)} ${["B", "KiB", "MiB", "GiB"][unit]}`;
}
export function formatElapsed(seconds) {
  return formatTime(Math.round(seconds || 0));
}
