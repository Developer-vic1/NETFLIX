# Funcionalidades locales implementadas

La aplicación usa HTML, CSS y módulos ES. Se sirve en `127.0.0.1:4173`; no conecta sistemas de producción de Netflix ni ejecuta una infraestructura global.

## Perfiles y actividad

La navegación lateral usa filas propias de 44 px, panel de hasta 304 px y grupos Explorar/Tu cuenta. Mantiene perfil actual y ruta activa. Flechas/Home/End desplazan el foco entre enlaces; Tab queda dentro del modal y Escape restaura el foco del botón. Elegir un enlace cierra el menú incluso cuando corresponde a la ruta actual. El contenido puede desplazarse en pantallas bajas y el panel cambia de lado con RTL. El enlace de operaciones conserva la condición de perfil administrador.

`profile.service.js` administra hasta ocho perfiles, valida nombres de 1–24 caracteres y mantiene un administrador y al menos un espectador. Víctor Asturizaga y Carla Encinas son los perfiles iniciales de espectador. El avatar abre el selector; `#/profiles` permite crear, editar, elegir color y eliminar perfiles de espectador.

`profileData[id]` contiene la lista, preferencias del reproductor, progreso, posiciones y notificaciones. La lista antigua se conserva para Víctor hasta su primera escritura. El reproductor captura el ID del perfil al montarse: un cambio de perfil durante la reproducción guarda la posición en la persona que empezó a verla. Guardar ajustes conserva historial y posiciones existentes.

El administrador tiene una ruta operativa diferenciada. Es una separación de experiencia local; no constituye una frontera de autorización de servidor. Cualquier persona con acceso a este navegador puede seleccionar el perfil administrador. Autenticación real permanece pendiente.

## Reproducción y descargas

Hay ocho títulos originales de Blender y un archivo completo aportado por el usuario con el nombre Spider-Man: Brand New Day. `media-player.js` conecta play, pausa, volumen, silenciar, velocidad, progreso, selección de fuente, fullscreen, ventana flotante cuando el navegador la admite, posiciones guardadas, teclado y siguiente título. Las preferencias de reproducción automática controlan el siguiente título; Caminandes avanza dentro de su serie. Audio original y ausencia de subtítulos se muestran según los recursos actuales. Las fichas de título permiten valorar por perfil, reiniciar la posición y abrir los episodios.

El botón único alterna icono y nombre accesible según los eventos reales del video. Un clic en el video también alterna reproducción. K/Espacio controlan reproducción; J/L y ←/→ desplazan 10 segundos; ↑/↓ cambian volumen; M silencia y F alterna fullscreen. Los atajos funcionan en la página del reproductor y conservan el comportamiento nativo de campos, botones y enlaces. Los desplazamientos y cambios de volumen muestran una respuesta visual. `time.js` comparte formato horario para progreso y reanudación (`2:24:38`) y unidades regionales para fichas (`2 h 24 min`).

La superficie de video integra controles sobre un degradado y los oculta tras tres segundos de inactividad durante reproducción. Teclado, movimiento del puntero y pausa los recuperan. En móvil permanecen bajo el video, dentro del mismo marco, para no tapar la imagen. Los ajustes se agrupan en un panel plegable con calidad/velocidad activas y pistas disponibles; guardar preferencias conserva calidad, velocidad, volumen y mute por perfil. PiP se habilita cuando hay fotogramas cargados y cambia su acción al entrar/salir. Descarga, detalles y fuente se separan de los ajustes; A continuación identifica el siguiente título real de la colección. El reloj muestra la posición recordada incluso antes de cargar metadatos.

`cache-videos.ps1` descarga la menor resolución útil de cada obra, comprueba el tamaño contra el catálogo y conserva archivos completos locales. Se excluyen de Git. `download.service.js` transfiere esos archivos a CacheStorage al pulsar Descargar, muestra avance real, permite cancelar y quitar descargas y consulta el espacio estimado. La resolución guardada es 360p o 480p, según la fuente; calidad manual superior utiliza la fuente original remota.

`sw.js` prepara la aplicación con `offline-manifest.json`. Los archivos de interfaz se solicitan primero a la red y tienen fallback local. Los videos se guardan solo por acción del usuario. Una descarga completa puede reproducirse tras recargar sin red; respuestas 206 sobre slices del Blob almacenado permiten avanzar. CacheStorage es compartido entre perfiles de este dispositivo. Las respuestas parciales del servidor de desarrollo cubren el mismo contrato cuando hay conexión.

La instalación offline requiere acceso inicial al servidor. Borrar datos del sitio o una descarga elimina su copia del navegador. Los módulos se sirven sin caché HTTP durante desarrollo; el Service Worker mantiene las copias necesarias para la experiencia offline.

## Monitoreo e integración

`session-telemetry.service.js` mide la descarga HTTP del catálogo mediante `performance.now()`. Guarda 60 muestras por región seleccionada y 60 puntos generales. La página administrativa actualiza cada 10 segundos cuando está visible y permite pausar esa actualización o medir manualmente. Al salir cancela fetch, intervalo, observers, suscripciones, mapa y Chart.

`HTMLVideoElement.getVideoPlaybackQuality()` aporta fotogramas totales/perdidos. Los eventos del medio aportan estado, tiempo, resolución e interrupciones `waiting`. Las señales de calidad describen fallos observados y permiten comparar resoluciones o muestras; no son predicciones ML ni pruebas de reducción de costos Cloud. «Primera / última» compara mediciones HTTP de esta sesión; el signo de la diferencia se explica en pantalla.

El mapa marca países con observaciones reales de este navegador. El país proviene de la preferencia seleccionada, no de geolocalización ni de sondas desplegadas globalmente. Los países sin muestras permanecen vacíos. El informe JSON incluye `scope: THIS_BROWSER`, fecha, región, datos, historial persistente de hasta 160 eventos y la ventana reciente del bus de 100 eventos. CSV exporta sesiones. Las cinco secciones, alertas, límites de conservación y movimiento se describen en [CONTROL-ROOM.md](CONTROL-ROOM.md).

Catálogo, perfiles, reproducción, lista y descargas producen eventos. Notificaciones conserva hasta 30 acciones por perfil, permite marcar leídas y borrar y respeta su preferencia de desactivación. El panel distingue funciones disponibles de ML, Billing, CRM y Cloud sin conectar. Los contratos académicos de recomendación y políticas adaptativas se mantienen pendientes para implementación manual.

## Animación y accesibilidad

La entrada de Inicio dibuja tres trazos de la N, mantiene la marca estable, la amplía y abre 36 haces de color. Dura 3,6 segundos y admite omitir, Escape y repetición con sonido. El audio es una composición original de osciladores Web Audio; no es la grabación del ident de Netflix. Se intenta automáticamente; si el navegador lo bloquea, «Activar sonido» reinicia la secuencia mediante una interacción. La animación sigue el reloj del audio mediante requestAnimationFrame, compensando la latencia de inicio del dispositivo: impactos a 0,24 y 0,72 s, barrido al comenzar los haces (55 %). La repetición cierra el contexto previo para evitar mezcla de secuencias. Reduced motion omite la entrada y las transiciones.

Durante la entrada el contenido queda inert y el foco se mantiene en sus controles; al cerrarla se libera. Los perfiles usan avatares de CSS, cambio de color, elevación y guiño. Las pantallas, tarjetas, descargas y acciones tienen transiciones. La navegación compacta aparece por debajo de 1200 px; 320 px usa tarjetas de una columna para conservar los controles completos.

## Referencias técnicas y procedencia

- [CacheStorage — MDN](https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage) y [Service Workers — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).
- [Estimación de almacenamiento — MDN](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate).
- Las fuentes de cada película, portada y archivo están en `assets/catalog-sources.json`; producción: [Blender Studio](https://studio.blender.org/films/) y distribución: [Blender Video](https://video.blender.org/).
- [Netflix Sans — Dalton Maag](https://www.daltonmaag.com/portfolio/custom-fonts/netflix-sans.html). Los archivos locales proceden del recurso público de Netflix `occ.a.nflxso.net/genc/hawkins/5.30.0/font/`.
- Referencia visual: [ident de Netflix](https://about.netflix.com/en/news/your-new-netflix-ident-animation-cue-netflix-sound) e [identidad de marca](https://brand.netflix.com/en/assets/logos/). La secuencia CSS y el sonido sintetizado son código del proyecto.
