// UI copy only. No academic analysis, algorithms, or invented operational results.
import { writeFile } from "node:fs/promises";
import en from "../locales/en.js";
import es from "../locales/es.js";
import ar from "../locales/ar.js";
const updates = {
  en: {
    "nav.new": "New & popular",
    "nav.settings": "Settings",
    "common.demo": "OPEN FILM",
    "common.academic": "The collection",
    "common.simulation": "SIMULATION",
    "common.todo": "This service is not connected yet.",
    "common.notOfficial": "Films by Blender Studio",
    "common.noResults": "No titles match your search.",
    "hero.eyebrow": "A BLENDER FOUNDATION FILM",
    "hero.title": "Sintel",
    "hero.description":
      "A young adventurer journeys across a vast world in search of a dragon she once saved.",
    "hero.explore": "Play",
    "hero.secondary": "More info",
    "hero.art": "2010 · Fantasy · 14 min",
    "hero.edition": "FEATURED TODAY",
    "home.catalog": "Find your next story",
    "home.continue": "Continue watching",
    "home.trending": "Explore the collection",
    "home.recommendations": "Picked for your next night in",
    "home.new": "Recently added",
    "home.myListEmpty":
      "Your list is empty. Save a title and find it here whenever you like.",
    "home.searchHint": "Titles, genres…",
    "home.searchStatus": "{count} results",
    "home.foundation": "Behind the screen",
    "home.foundationBody":
      "Explore the operations workspace and its simulated service states.",
    "title.name": "{name}",
    "title.play": "Play",
    "title.add": "Add to my list",
    "title.remove": "Remove from my list",
    "title.added": "Added to my list.",
    "title.removed": "Removed from my list.",
    "title.description":
      "Watch the film and explore its original production page.",
    "title.progress": "{progress}% watched",
    "settings.availability": "Region and language",
    "settings.partial":
      "Partial availability. Audio and subtitle options depend on the selected film.",
    "settings.unavailable":
      "No media-language mapping has been configured for this combination. You can still use the interface.",
    "settings.supported": "This region and language combination is available.",
    "settings.matrixNote":
      "Region preferences do not change the original audio or subtitle tracks of a film.",
    "settings.notifications": "Enable notifications",
    "settings.autoplay": "Autoplay",
    "account.subtitle": "Manage your profile and local preferences.",
    "account.demoPlan": "No subscription connected",
    "account.paymentEmpty": "No payment method connected.",
    "account.deviceDemo": "This browser",
    "account.logout": "End local session",
    "account.logoutDemo": "You are using a local profile.",
    "notification.placeholder": "No new notifications in this category.",
    "notification.empty": "Notifications are disabled in your settings.",
    "player.title": "Now playing",
    "player.subtitle": "Original films from Blender Studio.",
    "player.noMedia": "Preparing the film",
    "player.sourceTodo": "Choose a title from the catalog to start watching.",
    "player.network": "Network simulation",
    "player.bandwidth": "Bandwidth (Mbps)",
    "player.previewResult":
      "SIMULATION: {mbps} Mbps · selected quality {quality}.",
    "player.unconnected":
      "This feature is not available for the current source.",
    "player.next": "Next title",
    "player.nextTodo": "Choose another title in the catalog.",
    "player.originalAudio": "Original audio",
    "player.noSubtitles": "No subtitle track supplied by this source",
    "player.mediaError":
      "Could not load the video. Try again or open the original source.",
    "player.openSource": "Open original source",
    "player.qualityActual": "Available source quality",
    "operations.advance": "Advance service state",
    "operations.append": "Add sample",
    "operations.chartLabel": "Simulated latency (ms)",
    "operations.service": "Service",
    "operations.map": "Regional map",
    "operations.mapKeyboard": "Choose a region to read its simulated metrics.",
    "operations.noFixture": "No metrics configured for this region.",
    "intro.skip": "Skip intro",
    "intro.replay": "Replay intro",
    "intro.label": "Opening animation",
    "film.sintel":
      "A young adventurer searches for the dragon she rescued, following a journey through a mysterious world.",
    "film.spring":
      "A shepherd and her dog awaken ancient spirits in a mountain valley as the seasons begin to change.",
    "film.big-buck-bunny":
      "A gentle giant of a rabbit has had enough of three mischievous woodland troublemakers.",
    "film.tears-of-steel":
      "In a futuristic Amsterdam, a group confronts a robot threat and the consequences of a troubled past.",
    "film.elephants-dream":
      "Two travelers explore a strange mechanical world where their very different visions collide.",
    "film.caminandes-2":
      "Koro the llama faces a stubborn obstacle on the way to a tempting patch of grass.",
    "film.caminandes-3":
      "Koro discovers that finding food in Patagonia is easier with an unexpected companion.",
    "film.making-of-caminandes":
      "A look behind the scenes at the artists and production of Caminandes: Llamigos.",
    "settings.group.LATAM": "Latin America",
    "settings.group.NORTH_AMERICA": "North America",
    "settings.group.EUROPE": "Europe",
    "settings.group.ASIA_PACIFIC": "Asia Pacific",
    "settings.group.AFRICA": "Africa",
    "settings.group.MIDDLE_EAST": "Middle East",
    "home.notStarted": "You have not started watching yet.",
    "home.browse": "Browse films",
    "title.source": "Original production",
    "title.duration": "{minutes} min",
    "home.genre.animation": "Animated adventures",
    "home.genre.fantasy": "Fantasy worlds",
    "home.genre.short": "Short stories, big worlds",
  },
  es: {
    "nav.new": "Novedades populares",
    "nav.settings": "Configuración",
    "common.demo": "CINE ABIERTO",
    "common.academic": "La colección",
    "common.simulation": "SIMULACIÓN",
    "common.todo": "Este servicio todavía no está conectado.",
    "common.notOfficial": "Películas de Blender Studio",
    "common.noResults": "No hay títulos que coincidan con tu búsqueda.",
    "hero.eyebrow": "UNA PELÍCULA DE BLENDER FOUNDATION",
    "hero.title": "Sintel",
    "hero.description":
      "Una joven aventurera recorre un mundo inmenso en busca del dragón al que una vez rescató.",
    "hero.explore": "Reproducir",
    "hero.secondary": "Más información",
    "hero.art": "2010 · Fantasía · 14 min",
    "hero.edition": "HOY DESTACAMOS",
    "home.catalog": "Encuentra tu próxima historia",
    "home.trending": "Explora la colección",
    "home.recommendations": "Para tu próxima noche de cine",
    "home.new": "Añadidos recientemente",
    "home.myListEmpty":
      "Tu lista está vacía. Guarda un título y encuéntralo aquí cuando quieras.",
    "home.searchHint": "Títulos, géneros…",
    "home.searchStatus": "{count} resultados",
    "home.foundation": "Detrás de la pantalla",
    "home.foundationBody":
      "Explora el espacio de operaciones y los estados simulados de sus servicios.",
    "title.name": "{name}",
    "title.play": "Reproducir",
    "title.added": "Agregado a mi lista.",
    "title.removed": "Quitado de mi lista.",
    "title.description":
      "Mira la película y explora la página de su producción original.",
    "title.progress": "{progress}% visto",
    "settings.availability": "Región e idioma",
    "settings.partial":
      "Disponibilidad parcial. Las opciones de audio y subtítulos dependen de la película seleccionada.",
    "settings.unavailable":
      "Esta combinación aún no tiene una correspondencia de idioma multimedia configurada. Puedes seguir usando la interfaz.",
    "settings.supported":
      "Esta combinación de región e idioma está disponible.",
    "settings.matrixNote":
      "La región no cambia el audio original ni los subtítulos disponibles de cada película.",
    "settings.notifications": "Activar notificaciones",
    "settings.autoplay": "Reproducción automática",
    "account.subtitle": "Administra tu perfil y tus preferencias locales.",
    "account.demoPlan": "Sin suscripción conectada",
    "account.paymentEmpty": "Sin método de pago conectado.",
    "account.deviceDemo": "Este navegador",
    "account.logout": "Finalizar sesión local",
    "account.logoutDemo": "Estás usando un perfil local.",
    "notification.placeholder":
      "No hay nuevas notificaciones en esta categoría.",
    "notification.empty":
      "Las notificaciones están desactivadas en configuración.",
    "player.title": "Reproduciendo",
    "player.subtitle": "Películas originales de Blender Studio.",
    "player.noMedia": "Preparando la película",
    "player.sourceTodo": "Elige un título del catálogo para empezar.",
    "player.network": "Simulación de red",
    "player.bandwidth": "Ancho de banda (Mbps)",
    "player.previewResult":
      "SIMULACIÓN: {mbps} Mbps · calidad seleccionada {quality}.",
    "player.unconnected":
      "Esta función no está disponible para la fuente actual.",
    "player.next": "Siguiente título",
    "player.nextTodo": "Elige otro título del catálogo.",
    "player.originalAudio": "Audio original",
    "player.noSubtitles": "Esta fuente no incluye una pista de subtítulos",
    "player.mediaError":
      "No se pudo cargar el video. Reintenta o abre la fuente original.",
    "player.openSource": "Abrir fuente original",
    "player.qualityActual": "Calidad disponible en la fuente",
    "operations.advance": "Avanzar estado del servicio",
    "operations.append": "Agregar muestra",
    "operations.chartLabel": "Latencia simulada (ms)",
    "operations.map": "Mapa regional",
    "operations.mapKeyboard":
      "Selecciona una región para consultar sus métricas simuladas.",
    "operations.noFixture": "Sin métricas configuradas para esta región.",
    "intro.skip": "Omitir intro",
    "intro.replay": "Ver intro",
    "intro.label": "Animación de entrada",
    "film.sintel":
      "Una joven aventurera busca al dragón que rescató y emprende un viaje por un mundo lleno de misterio.",
    "film.spring":
      "Una pastora y su perro despiertan a los espíritus de un valle montañoso para dar paso a una nueva estación.",
    "film.big-buck-bunny":
      "Un conejo gigante y apacible decide enfrentarse a tres traviesos habitantes del bosque.",
    "film.tears-of-steel":
      "En una Ámsterdam futurista, un grupo se enfrenta a una amenaza robótica y a las consecuencias del pasado.",
    "film.elephants-dream":
      "Dos viajeros recorren un extraño mundo mecánico en el que sus distintas visiones entran en conflicto.",
    "film.caminandes-2":
      "Koro, una llama de la Patagonia, encuentra un obstáculo inesperado en el camino hacia su comida.",
    "film.caminandes-3":
      "Koro descubre que conseguir comida en la Patagonia resulta más fácil con un compañero inesperado.",
    "film.making-of-caminandes":
      "Una mirada al trabajo de los artistas y a la producción de Caminandes: Llamigos.",
    "settings.group.LATAM": "América Latina",
    "settings.group.NORTH_AMERICA": "América del Norte",
    "settings.group.EUROPE": "Europa",
    "settings.group.ASIA_PACIFIC": "Asia Pacífico",
    "settings.group.AFRICA": "África",
    "settings.group.MIDDLE_EAST": "Oriente Medio",
    "home.notStarted": "Todavía no has empezado a ver una película.",
    "home.browse": "Explorar películas",
    "title.source": "Producción original",
    "title.duration": "{minutes} min",
    "home.genre.animation": "Aventuras animadas",
    "home.genre.fantasy": "Mundos de fantasía",
    "home.genre.short": "Historias cortas, grandes mundos",
  },
  ar: {
    "common.demo": "سينما مفتوحة",
    "common.academic": "المجموعة",
    "common.simulation": "محاكاة",
    "common.notOfficial": "أفلام Blender Studio",
    "hero.title": "Sintel",
    "hero.eyebrow": "فيلم من Blender Foundation",
    "hero.description":
      "تسافر مغامرة شابة عبر عالم واسع بحثاً عن تنين أنقذته من قبل.",
    "hero.explore": "تشغيل",
    "hero.secondary": "مزيد من المعلومات",
    "hero.art": "2010 · خيال · 14 دقيقة",
    "hero.edition": "اختيار اليوم",
    "home.catalog": "اعثر على قصتك القادمة",
    "home.trending": "استكشف المجموعة",
    "home.new": "أضيف مؤخراً",
    "home.searchHint": "عناوين وأنواع…",
    "home.searchStatus": "{count} نتائج",
    "home.myListEmpty": "قائمتك فارغة. احفظ عنواناً للعودة إليه لاحقاً.",
    "title.name": "{name}",
    "title.progress": "{progress}% تمت مشاهدته",
    "title.description": "شاهد الفيلم واستكشف صفحة الإنتاج الأصلية.",
    "settings.availability": "المنطقة واللغة",
    "settings.notifications": "تفعيل الإشعارات",
    "settings.autoplay": "تشغيل تلقائي",
    "account.subtitle": "إدارة ملفك وتفضيلاتك المحلية.",
    "account.demoPlan": "لا يوجد اشتراك متصل",
    "account.deviceDemo": "هذا المتصفح",
    "account.logout": "إنهاء الجلسة المحلية",
    "account.logoutDemo": "أنت تستخدم ملفاً محلياً.",
    "notification.placeholder": "لا توجد إشعارات جديدة في هذه الفئة.",
    "notification.empty": "الإشعارات معطلة في الإعدادات.",
    "player.title": "قيد التشغيل",
    "player.subtitle": "أفلام أصلية من Blender Studio.",
    "player.originalAudio": "الصوت الأصلي",
    "player.noSubtitles": "لا يحتوي هذا المصدر على مسار ترجمة",
    "player.mediaError":
      "تعذر تحميل الفيديو. حاول مجدداً أو افتح المصدر الأصلي.",
    "player.openSource": "فتح المصدر الأصلي",
    "player.qualityActual": "الجودة المتاحة في المصدر",
    "player.next": "العنوان التالي",
    "intro.skip": "تخطي المقدمة",
    "intro.replay": "إعادة المقدمة",
    "intro.label": "حركة البداية",
    "film.sintel":
      "تبحث مغامرة شابة عن تنين أنقذته وتنطلق في رحلة عبر عالم غامض.",
    "film.spring": "توقظ راعية وكلبها أرواح وادٍ جبلي إيذاناً بتغير الفصول.",
    "film.big-buck-bunny":
      "يواجه أرنب عملاق ولطيف ثلاثة سكان مشاغبين في الغابة.",
    "film.tears-of-steel":
      "تواجه مجموعة في أمستردام المستقبلية تهديداً آلياً وعواقب الماضي.",
    "film.elephants-dream":
      "يسافر شخصان عبر عالم ميكانيكي غريب تتصادم فيه رؤاهما.",
    "film.caminandes-2":
      "تواجه اللاما كورو عقبة غير متوقعة في طريقها إلى الطعام.",
    "film.caminandes-3":
      "تجد كورو رفيقاً غير متوقع أثناء البحث عن الطعام في باتاغونيا.",
    "film.making-of-caminandes":
      "نظرة خلف الكواليس إلى الفنانين وإنتاج Caminandes: Llamigos.",
    "settings.group.LATAM": "أمريكا اللاتينية",
    "settings.group.NORTH_AMERICA": "أمريكا الشمالية",
    "settings.group.EUROPE": "أوروبا",
    "settings.group.ASIA_PACIFIC": "آسيا والمحيط الهادئ",
    "settings.group.AFRICA": "أفريقيا",
    "settings.group.MIDDLE_EAST": "الشرق الأوسط",
    "home.notStarted": "لم تبدأ مشاهدة فيلم بعد.",
    "home.browse": "استكشاف الأفلام",
    "title.source": "الإنتاج الأصلي",
    "title.duration": "{minutes} دقيقة",
    "home.genre.animation": "مغامرات متحركة",
    "home.genre.fantasy": "عوالم الخيال",
    "home.genre.short": "قصص قصيرة وعوالم كبيرة",
  },
};
for (const [code, original] of Object.entries({ en, es, ar })) {
  const cleaned = Object.fromEntries(
    Object.entries(original).map(([key, value]) => [
      key,
      value
        .replace(/\bdemo\b/gi, "")
        .replace(/تجريبية|تجريبي/g, "")
        .replace(/ {2,}/g, " ")
        .trim(),
    ]),
  );
  const dict = { ...cleaned, ...updates[code] };
  await writeFile(
    `locales/${code}.js`,
    `export default ${JSON.stringify(dict, null, 2)};\n`,
  );
}
