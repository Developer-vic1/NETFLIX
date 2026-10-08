# Evidencia técnica de QA

## Movimiento de originales y seguimiento de cargas — 2026-10-08

Resultado actual comunicado para esta revisión: **39 pruebas JavaScript**, comprobación estática de **81 módulos**, y **24 pruebas Python: 23 correctas y 1 omitida** por falta de permisos de creación de symlinks en Windows. Las pruebas de importación trabajan con archivos temporales; no mueven archivos personales. Cubren integridad de bytes, colisiones, cancelación, rollback si no se puede eliminar el original, cambios de fuente después de seleccionarla, rutas absolutas, títulos internacionales y falta de espacio.

La comprobación de interfaz en el origen aislado `http://127.0.0.1:4175/` incorporó una película y una serie de dos episodios a partir de fuentes temporales. Los originales se movieron completos y los SHA-256 coincidieron con los registrados antes del movimiento. La notificación de finalización y su botón Ver progreso abrieron correctamente el seguimiento con las rutas de ambos capítulos. El segundo capítulo se reprodujo y el control cambió de Reproducir a Pausar y de vuelta al pausar; el video alcanzó readyState 4 y avanzó su tiempo. El catálogo general conserva la serie y excluye sus capítulos sueltos. La ventana de progreso se revisó a 390 píxeles CSS sin desbordamiento horizontal. Captura: output/playwright/transfer-completed.jpg. Los dos episodios se descargaron y persistieron al recargar. Con el servidor aislado 4175 detenido, el segundo capítulo se reprodujo desde la caché, avanzó hasta 01:49 y alcanzó readyState 4. El selector propio de orden se comprobó también en 4173 mediante End y Enter, eligiendo Mayor tamaño. El selector nativo y el doble clic del ejecutable no se probaron en esta comprobación.

Desde PowerShell en la raíz del proyecto, con el servidor abierto en otra terminal:

```powershell
npm.cmd run check
npm.cmd test
python -m unittest discover -s tests -p 'test_*.py'
```

### Procedimiento manual del flujo actual

Usa un perfil de navegador de prueba y **archivos MP4 temporales que puedas mover**. Guardar cambia la ubicación del original; no utilices una única copia de un archivo personal para probar cancelación o colisiones. Abre la aplicación con `Netflix.exe` o `python scripts/serve.py` y conserva el servidor abierto.

1. Cambia al perfil Administrador y abre Biblioteca de películas. Pulsa Añadir película, completa los metadatos y una portada válida. Comprueba que Elegir MP4 del equipo abre el selector de Windows y que cancelarlo conserva el formulario sin mensaje de error.
2. Selecciona un MP4 temporal mediante la ventana nativa. Repite con otro archivo usando su ruta absoluta y Usar esta ruta. Comprueba que seleccionar no elimina ni mueve el original, y que se leen duración, resolución y vista previa. Rechaza un archivo WebM renombrado a `.mp4` y una ruta relativa con un aviso visible.
3. Guarda un borrador con el título Prueba local. Confirma que termina en `videos/prueba-local.mp4`, mantiene exactamente su tamaño y que el original ya no existe. En el mismo disco el movimiento puede finalizar inmediatamente: no se exige una animación de duración artificial. El borrador debe quedar fuera del catálogo del espectador.
4. Para observar progreso sostenido, usa un MP4 temporal suficientemente grande en **otro volumen**. Comprueba bytes procesados, archivo, fase y avance creciente; el porcentaje debe proceder de la copia real. Mantén el original presente mientras se copia. Al finalizar deben desaparecer el original y el parcial, quedando el MP4 íntegro en el destino.
5. Durante esa copia, pulsa Continuar en segundo plano. Navega a Inicio y vuelve al administrador. Abre Ver progreso desde el control flotante; la tarea debe seguir avanzando. Confirma la notificación de resultado y su acceso al seguimiento. **No recargues ni cierres la pestaña activa**: la continuidad soportada es navegación dentro de la aplicación.
6. Repite la copia entre volúmenes y pulsa Cancelar carga antes de Confirmando. El original debe permanecer intacto y el parcial eliminarse. Reintentar debe completar la misma tarea sin duplicados. Durante Confirmando/Guardando la ficha, cancelar debe estar desactivado.
7. Añade una serie con dos episodios: temporada 1, números 1 y 2. Comprueba el orden automático por temporada/número y la prevención de posiciones duplicadas. No hay botones para reordenar episodios manualmente. Comprueba procesamiento secuencial y destinos `series/prueba-serie_#1.mp4` y `series/prueba-serie_#2.mp4`. Añade temporada 2, capítulo 1 y comprueba `series/prueba-serie_T2_#1.mp4`. En URLs el carácter `#` debe viajar como `%23`; los videos deben reproducirse y permitir avance por rangos.
8. Cancela una serie mientras se copia su segundo episodio. El primero ya trasladado debe seguir en la carpeta y reutilizarse al reintentar durante la misma sesión. El capítulo en curso conserva su original. La serie no debe anunciar publicación antes de guardar correctamente su ficha.
9. Prueba un destino ocupado con otro original: debe aparecer el mensaje de conflicto sin sobrescribir ninguno. Modifica un original después de seleccionarlo: el guardado debe solicitar volver a seleccionarlo. Revisa los mensajes de permisos/espacio cuando esas condiciones puedan reproducirse de forma controlada.
10. Publica el registro terminado, recarga cuando ya no haya tareas activas y comprueba ficha, búsqueda, reproducción y episodios. Prueba buscar/filtrar/ordenar por título, año, tamaño y actualización. Verifica selectores propios mediante clic y teclado, Escape, foco visible y movimiento reducido.

Las pruebas automatizadas no acreditan por sí solas el selector nativo, el doble clic en el ejecutable ni tiempos en otro disco físico. El tiempo depende del volumen, tamaño, permisos y velocidad del equipo. El archivo base de Spider-Man se sirve ahora desde `videos/spider-man-brand-new-day.mp4`.

## Historial de revisiones anteriores

**Todo lo que sigue es evidencia histórica, con fechas y contratos anteriores.** Sus instrucciones para repetir escenarios no validan el flujo actual de selector nativo y movimiento de originales. En particular, `qa-library.cjs` y `qa-mp4-quick.cjs` esperan guardar el MP4 en IndexedDB y requieren adaptación antes de reutilizarse para este cambio. Sus antiguos totales no se suman a los resultados actuales. Para verificar la nueva versión utiliza los comandos y el procedimiento manual de arriba.

## Alta de películas y avisos de validación — revisión actual

Fecha: 2026-10-02. «Añadir película» abre el editor y enfoca el título; ya no aparece un editor vacío antes del clic. Los archivos rechazados muestran el motivo al lado del selector de video o portada. Guardar con campos obligatorios o portada faltante muestra un aviso y enfoca el campo que requiere atención. Si se intenta reemplazar un archivo por otro inválido, se bloquea el guardado hasta elegir uno válido.

`scripts/qa-mp4-quick.cjs`: 13/13 comprobaciones en un contexto aislado, incluidas apertura, mensajes de campos faltantes, rechazo de MP4 falso y WebM, falta de portada, publicación, retirada, filtros y persistencia. `scripts/qa-library.cjs`: 11/11 para archivo íntegro, reproducción y disponibilidad offline. `npm run check`, `npm test` (31/31) y `git diff --check` pasaron. Captura del aviso: `output/playwright/mp4-validation-message.png`.

## Biblioteca de películas MP4 — revisión actual

Fecha: 2026-10-02. El selector acepta `.mp4`. La validación verifica nombre, MIME, caja `ftyp` y marcas compatibles del contenedor, y solicita al navegador duración, resolución y un primer fotograma decodificado antes de guardar. El archivo completo se conserva en IndexedDB. Al recargar, los registros antiguos con un formato distinto permanecen editables para reemplazar el archivo, pero no se publican en el catálogo.

El administrador puede buscar por título, género o productora; filtrar por estado; ver recuentos y espacio almacenado; y publicar o retirar películas. `scripts/qa-mp4-quick.cjs` pasó 10/10 comprobaciones en un contexto Chromium aislado: archivo falso con extensión `.mp4`, WebM, publicación, búsqueda, filtro, retirada, republicación y persistencia tras recarga. `scripts/qa-library.cjs` pasó 11/11: borrador, reproducción, catálogo, comparación SHA-256 del archivo íntegro, acceso sin red y ancho móvil. `npm run check` y `npm test` pasaron (31/31 pruebas unitarias); `git diff --check` no reportó errores. Las pruebas usan un MP4 local real y no alteran la biblioteca del navegador del usuario. Captura: `output/playwright/mp4-library.png`.

La validación lee la cabecera y confirma que el navegador decodifica el inicio; no es un análisis exhaustivo de cada fotograma ni una transcodificación. La biblioteca sigue siendo local a este navegador, sin servidor de ingestión. Ejecutar el escenario con una sesión Playwright CLI abierta: `npx.cmd --yes --package @playwright/cli playwright-cli -s=netflix-mp4 run-code --filename scripts/qa-mp4-quick.cjs`.

## Menú lateral compacto — revisión actual

Fecha: 2026-10-02. Causa: el menú lateral reutilizaba `.nav-link`, cuya altura `100%` estaba destinada a la barra de escritorio. Se separan `.drawer-link` y `.nav-link`; el panel de navegación mide como máximo 304 px, agrupa Explorar/Tu cuenta y muestra perfil actual. Las filas miden 44 px, con hover acotado y marca de ruta activa. El cuerpo puede desplazarse sin estirar las opciones; notificaciones conserva su diseño independiente.

`qa-navigation.cjs`: 25/25, sin errores de JavaScript. Comprueba ruta activa, flechas/Home/End, confinamiento de Tab, Escape y restauración de foco, cierre al elegir la ruta actual, navegación efectiva, cierre por backdrop y acceso del administrador. Matriz: 320, 390, 849 y 1024 px × español, inglés, italiano y árabe. Sin desbordamiento horizontal ni filas mayores de 60 px. `npm test`: 24/24; comprobación estática: 69 módulos. No se ha repetido el conjunto histórico completo.

La pestaña real del usuario se actualizó y el menú quedó abierto con todas las opciones compactas; se conservó la posición del video en `1:07:13`. Capturas de navegador: `output/playwright/navigation-849.png` y `output/playwright/navigation-320.png`. Repetir: `.\scripts\qa.ps1 -Scenario navigation`.

## Distribución del reproductor — revisión actual

Fecha: 2026-10-02. `qa-player-distribution.cjs`: 30/30 comprobaciones, sin errores de JavaScript. Incluye panel plegable, acceso desde el video, guardado y restauración reales de velocidad/volumen, ocultación de controles tras inactividad y recuperación por teclado. Distribución comprobada en 320, 390, 768, 1024, 1366 y 1920 px, en español, inglés, italiano y árabe; sin desbordamiento horizontal ni controles fuera del viewport.

`qa-player-ux.cjs`: 16/16 comprobaciones del video real, pausa/reproducción, teclado, fullscreen y reloj en horas. `qa-features.cjs`: 31/31, incluidas descargas y reproducción offline, sin errores ni solicitudes fallidas. `npm test`: 24/24. Capturas reales en `output/playwright/player-ux-hours.png` y `output/playwright/player-distribution-mobile.png`. El conjunto completo anterior de 396 comprobaciones no se repitió para este cambio.

Se verificó además la pestaña real del usuario: estaba ejecutando la interfaz anterior (dos botones y `64:04 / 144:38`). Tras recargarla sin borrar almacenamiento, mostró un único control que cambió de Reproducir a Pausar y volvió a Reproducir; conservó progreso y mostró `1:04:12 / 2:24:38`. Las pruebas automatizadas adicionales usan contextos aislados para no modificar perfiles ni preferencias del usuario.

Repetir: `.\scripts\qa.ps1 -Scenario player-distribution` y `.\scripts\qa.ps1 -Scenario player-ux`.

## Interactividad del reproductor y sincronización — revisión actual

Fecha: 2026-10-02. `qa-player-ux.cjs`: 16/16 comprobaciones, sin errores. Video real Caminandes 2 para alternar play/pausa, un único botón, teclas desde foco en main, seek con respuesta visible, mute y volumen reales, protección de inputs, clic en video y entrada/salida de fullscreen. Archivo completo local Spider-Man para duración en horas en la ficha, seek real a 3661 s, reloj `1:01:01 / 2:24:38` y texto accesible del progreso. Captura real: `output/playwright/player-ux-hours.png`.

`qa-intro.cjs`: 9/9, sin errores. Se detectó un desfase de 280 ms al usar relojes independientes. La corrección pausa las animaciones CSS y las avanza con el reloj de AudioContext. Muestra verificada: animación 352 ms, audio relativo 352 ms. Incluye señal no nula, autoplay bloqueado, repetición, cierre y movimiento reducido. `qa-features.cjs`: 31/31, sin errores ni solicitudes fallidas, incluida descarga, recarga y reproducción offline. `npm test`: 24/24; comprobación estática: 69 módulos; manifiesto offline: 105 recursos.

Repetir: `.\scripts\qa.ps1 -Scenario player-ux` y `.\scripts\qa.ps1 -Scenario intro`. Las secciones siguientes conservan resultados de revisiones anteriores; no representan un nuevo pase completo de 396 comprobaciones.

## Duración y audio de la entrada — revisión actual

Fecha: 2026-10-02. Se corrige la intro excesivamente breve de la revisión anterior: entrada y repetición de 3600 ms, N estable hasta el 50 % de la secuencia y apertura de haces después del 55 %. La portada WebP y la preparación offline limitada se conservan; el registro offline comienza después de la nueva entrada. El tiempo de animación es intencional y ya no corresponde a la medición anterior de 1,4 s.

El audio se intenta automáticamente. Cuando AudioContext está suspendido por el navegador, el botón muestra «Activar sonido»; su clic reinicia la secuencia completa con sonido. Escape y omitir cierran el contexto. Movimiento reducido evita animación y audio. El escenario `features` también se repitió: 31/31, sin errores ni solicitudes fallidas; acepta ambos nombres accesibles del botón según el estado real de autoplay.

Verificación: `scripts/qa-intro.cjs`, 8/8 comprobaciones en un contexto Chromium limpio, sin errores. Comprueba duración CSS, legibilidad de la N a los 1500 ms, intento automático, alternativa para autoplay bloqueado, señal de audio no nula tras clic mediante un analizador real, repetición, cierre y movimiento reducido. 21/21 pruebas unitarias y comprobación estática también pasaron. La señal no nula prueba generación de audio; no mide el volumen físico del dispositivo ni identidad con el audio original de Netflix.

## Carga de Inicio — corrección anterior

Fecha: 2026-10-02. Chromium, servidor local `127.0.0.1:4173`, contexto limpio. La medición termina cuando existe el catálogo y la intro ya no bloquea el contenido; no representa tiempos de Internet ni de otros equipos.

- Antes: primera entrada utilizable a los 3558 ms; DOMContentLoaded a los 544 ms. La entrada imponía 3000 ms adicionales.
- Después: primera entrada utilizable a los 1429 ms; DOMContentLoaded a los 315 ms. Recarga real: 1411 ms. Sin errores de JavaScript.
- Portada: PNG de 5 819 379 bytes sustituido por WebP de 94 996 bytes, con las mismas dimensiones (2048 × 872). El original se conserva y se excluye de la preparación offline.
- Entrada automática de 1100 ms; reproducción voluntaria completa de 3000 ms con sonido, Escape y movimiento reducido conservados.
- Registro offline después de la entrada, preparación limitada a cuatro solicitudes simultáneas y escritura de caché fuera del camino de respuesta.
- Revalidación: 31/31 comprobaciones del escenario `features` (incluye reproducción offline, perfiles, administrador e intro), 21/21 unitarias, comprobación estática y `node --check sw.js`. El conjunto de 396 comprobaciones de la sección siguiente corresponde a la revisión anterior y no se ha repetido completo para este cambio.

Repetir la medición: `npx.cmd --yes --package @playwright/cli playwright-cli -s=netflix-qa run-code --filename scripts/measure-startup.cjs`, con una sesión CLI abierta. El script usa un contexto independiente y recarga el documento para la segunda muestra. El servidor se restableció como proceso oculto con salida redirigida a `output/server`, para que su consola no dependa de una llamada de terminal activa.

## Control operativo ampliado y archivo local — versión actual

Fecha: 2026-10-02, America/La_Paz. **396/396 comprobaciones de navegador y 21/21 unitarias**, sin errores de consola ni solicitudes fallidas. Resultados y fechas por escenario en [control-room-qa-results.json](control-room-qa-results.json). El recuento de código propio está en [source-metrics.json](source-metrics.json); excluye bibliotecas, scripts, tests, documentación, manifiestos y medios.

- Catálogo: 53/53. Nueve títulos, ficha de contenido, búsqueda, reproducción y rutas en cuatro idiomas.
- Funciones generales: 31/31. Perfiles, listas independientes, notificaciones, preferencias, métricas HTTP, mapa, informes, cleanup, intro con audio mediante clic y reproducción de episodio tras recargar sin conexión.
- Operaciones: 20/20. Valoración persistente, orden por año, dos episodios reales, velocidad, mute, sesiones persistentes, comparación, detalle, CSV, región sin datos, cuatro comprobaciones reales y búsqueda de eventos. Una latencia de red controlada de 180 ms en Chromium recorre la medición HTTP real y genera una alerta; se verifica nota, revisión y resolución. Ese retraso solo existe durante QA.
- Archivo local: 4/4. Spider-Man aparece en Tendencias con portada, abre su ficha, decodifica el archivo completo de 8.678 segundos y permite avanzar al minuto cinco. Original y copia tienen SHA-256 idéntico. No se recortó ni transcodificó. La descarga offline validada corresponde a Caminandes, sin afirmar una prueba de almacenamiento offline de los 3,75 GB de Spider-Man.
- Layout: 288/288. Ocho tamaños, cuatro idiomas y nueve pantallas, incluyendo ficha de título. Revisa límites, IDs, nombres, RTL, gráficos y mapa. Las regiones sin observaciones permanecen vacías.
- Unitarias: 21/21. Estadísticas ponderadas, P95, datos corruptos, conservación limitada, umbrales, deduplicación y notas, CSV protegido frente a fórmulas y almacenamiento bloqueado, además de los contratos previos.

Se grabó el cambio entre las cinco secciones de un administrador con datos obtenidos durante reproducción y solicitudes locales reales. El archivo `output/playwright/admin-transitions.webm` y sus capturas están ignorados por Git. La grabación terminó sin errores.

Correcciones verificadas: montar el mapa antes de inicializarlo, evitar medirlo cuando su contenedor está oculto y usar entradas CSS para páginas extensas para evitar timeouts de View Transitions. Se mantiene el movimiento reducido. Chromium es el motor probado; otros motores y lectores de pantalla siguen pendientes. ML, pagos, CRM y Cloud permanecen sin conectar.

Repetir: `npm run check`, `npm test`, `python scripts/serve.py` y `.\scripts\qa.ps1 -Scenario all`. El conjunto actual ejecuta `catalog`, `features`, `operations`, `local-film` y `layout`. `node scripts/source-metrics.mjs` recalcula el código y `node scripts/archive-qa.mjs` conserva los resultados, rechazando escenarios fallidos.

## Perfiles, administrador, descargas e intro — versión anterior

Fecha: 2026-10-02, America/La_Paz. Comprobación conjunta final: **340/340** verificaciones de navegador y **15/15** unitarias, sin errores de consola ni respuestas HTTP fallidas. Resultados en [experience-qa-results.json](experience-qa-results.json).

- Catálogo: 53/53. Inicio real, búsqueda, detalles, reproducción y rutas en cuatro idiomas.
- Funciones: 31/31. Víctor Asturizaga, Carla Encinas, administrador, creación/edición/eliminación de perfil, aislamiento de listas y posiciones durante cambio de perfil, notificaciones reales y marcado de lectura, preferencias de contenido, guard de navegación administrativa, métricas HTTP reales, mapa vacío en regiones no observadas, comparación de muestras, exportación JSON y cleanup.
- Offline: el escenario de funciones descarga un episodio completo, activa offline en el contexto del navegador, recarga la aplicación, reproduce fotogramas y adelanta mediante rangos. Comprueba eliminación de la copia y rangos reales de 1024 bytes para los ocho archivos locales.
- Intro: refrescar Inicio monta la N y 36 haces. Un clic inicia AudioContext real en estado running y con reloj avanzado; Escape libera contenido y audio. Reduced motion omite la secuencia. La prueba confirma activación y cleanup; no acredita identidad acústica con la grabación original de Netflix.
- Layout: 256/256 (8 tamaños × 4 idiomas × 8 pantallas). 320–2560 px; español, inglés, italiano y árabe; inicio, series, ajustes, cuenta, perfiles, descargas, reproductor y operaciones. Revisa overflow, controles recortados, encabezados, IDs, nombres accesibles, gráfico, mapa y ausencia de textos demo/disclaimer en la interfaz.
- Unitarias: 15/15. Añaden identidad local, aislamiento de historial, cambio durante playback, migración de lista existente, validación, límite de perfiles y fallo de almacenamiento.

Repetir: `npm run check`, `npm test`, `python scripts/serve.py` y, en otra terminal, `.\scripts\qa.ps1 -Scenario all`. El script ejecuta `catalog`, `features` y `layout`. El escenario `interactions` conserva el scaffold histórico y no se incluye en la ejecución actual.

La revisión visual comprobó capturas de perfiles, administrador y mobile después de finalizar sus transiciones. Chromium es el motor probado; lectores de pantalla y otros motores siguen pendientes de revisión manual. El rol administrativo es local, los KPIs pertenecen a este navegador y las conexiones externas no se han implementado. No se ejecutaron pagos, infraestructura Cloud ni sistemas Netflix. No hubo publicación.

## Corrección de carga del catálogo real — 2026-10-02

Resultado actual: **53/53** verificaciones del escenario `scripts/qa-catalog.cjs`, cero errores de consola y cero respuestas HTTP fallidas. Verifica la URL exacta `/#/home`, ocho títulos reales sin el campo antiguo `number`, detalles, búsqueda, reproducción real de Sintel, pausa, avance a 30 segundos y retorno a Inicio. Comprueba las diez rutas en español, inglés, italiano y árabe. Los contratos unitarios pasan **10/10**, incluida la cobertura completa de claves italianas.

Causa del error de Inicio: la tarjeta anterior accedía a `title.number.replace(...)`, pero el catálogo real usa `name`, `poster` y `qualities`. La tarjeta ahora consume esos campos directamente. Reintentar recarga el documento y sus módulos. El servidor `scripts/serve.py` responde `Cache-Control: no-store` y admite rangos de bytes de video. Comprobación HTTP real: `bytes=1000-1999` devuelve `206`, `Content-Range: bytes 1000-1999/83747601` y exactamente 1000 bytes. Esto corrige el avance de video que fallaba con el servidor simple anterior.

Repetir con `python scripts/serve.py` y, en otra terminal, `.\scripts\qa.ps1 -Scenario catalog`. Evidencia JSON en `docs/catalog-qa-results.json`.

Las matrices de layout e interacciones descritas a continuación corresponden al scaffold anterior. No validan los cambios recientes del catálogo, los estilos ni el reproductor. Sus escenarios conservan selectores antiguos y requieren actualización antes de volver a usarse para esta versión.

## Evidencia histórica del scaffold

Fecha local: 2026-10-02 (America/La_Paz). Entorno: Windows, Chrome/Chromium 154.0.8037.93, Playwright CLI 0.1.22, Node 25.0.0 y Python 3.14.0. Servidor HTTP local en 127.0.0.1:4173; sin backend ni BD.

## Validaciones

| Verificación solicitada | Resultado | Alcance |
| --- | --- | --- |
| Desktop | PASS | 1024, 1366, 1440, 1920 y 2560 px; cinco pantallas |
| Tablet | PASS | 768×1024; cinco pantallas |
| Mobile | PASS | 320×740 y 390×844; cinco pantallas y drawer |
| Spanish | PASS | Textos del scaffold, formularios y persistencia |
| English | PASS | Textos del scaffold, formularios y persistencia |
| Arabic RTL | PASS | Cinco pantallas, drawer, formularios, retorno a LTR; timeline preserva LTR |
| Console | PASS | Sin errores de consola ni excepciones en escenarios finales |
| Broken files | PASS | Importaciones y assets locales; ninguna respuesta HTTP >=400 en escenarios finales |

Matriz: **120/120** combinaciones (8 tamaños × 3 idiomas × 5 pantallas: inicio, preferencias, cuenta, reproductor y operaciones). Tamaños: 320×740, 390×844, 768×1024, 1024×768, 1366×768, 1440×900, 1920×1080 y 2560×1440. Comprueba overflow horizontal, controles recortados, IDs duplicados, nombres de controles, encabezados, navegación visible, instancias de gráfico y mapa y dirección de lectura.

Contratos: **10/10** pruebas con node:test. Comprueban traducciones, fallback, independencia de región/idioma, vuelta de RTL a LTR, almacenamiento corrupto/bloqueado, allowlist, límites de arrays, validación de entradas y recuperación de estados de servicios.

Interacciones: resultados finales en `qa-results.json`. Incluyen menú móvil y árabe, Escape, focus trap, restore focus, backdrop, notificaciones y su preferencia, rutas de catálogo, US + Español, persistencia, parcial/no disponible, traducciones parciales, búsqueda con debounce, Mi lista, controles de reproductor pendientes, red demo inválida/offline, selector de calidad, tooltips y alternativa de teclado del mapa, 100 eventos, 60 puntos, cleanup de gráficos/mapa y reduced motion.

## Repetir comprobaciones

Con el servidor estático activo:

```powershell
npm run check
npm test
.\scripts\qa.ps1
```

Playwright CLI se obtiene con `npx`; es tooling de QA opcional. El script requiere Node/npm, navegador disponible y puerto 4173. Crea una sesión `netflix-qa`, limpia las preferencias solo en ese navegador de prueba y conserva evidencia en `output/playwright/` (ignorada por Git). Los escenarios también se pueden ejecutar individualmente con `-Scenario layout` o `-Scenario interactions`.

## Correcciones durante QA

- Error de sintaxis inicial en operaciones: corregido antes de la validación final.
- Ruta incorrecta de CSS de jsVectorMap al descargar: corregida; estilos guardados localmente.
- Primera espera de QA usaba una página con JS anterior en caché: el escenario ahora recarga antes de comprobar rutas.
- Botones de tarjeta recortados en mobile: corregidos con controles de icono etiquetados y flex sizing; la prueba ahora examina sus límites, además del scroll global.
- La prueba de hover de US apuntaba al centro del bounding box compuesto, sobre Europa. Ahora prueba un trazado continuo (BR) y comprueba tooltip real y límites del viewport.
- Capturas tomadas durante transición: el escenario espera el fin de la animación antes de generar evidencia visual.

## Límites y revisión humana pendiente

- PASS se refiere a las verificaciones descritas en Chrome/Chromium. Firefox, Safari, dispositivos físicos, lector de pantalla y revisión lingüística humana quedan pendientes.
- Esto no es una certificación WCAG ni una validación formal W3C. Se verificaron nombres, etiquetas, IDs, teclado y foco en el DOM del navegador.
- Se revisaron visualmente las capturas de inicio desktop, inicio árabe mobile y operaciones RTL. No se afirma una inspección visual humana de cada una de las 120 combinaciones.
- Siete idiomas siguen parciales con fallback al inglés; nombres de países y etiquetas técnicas conservan sus valores de configuración demo.
- No se probó reproducción multimedia, streaming real, ABR, autenticación, facturación real ni infraestructura: esos módulos no están implementados y deben completarse manualmente.
- El modo offline conserva módulos ya cargados y fixtures de la sesión; no hay service worker ni soporte de recarga offline inicial.
- Los valores operacionales son fixtures deterministas. No representan mediciones ni resultados académicos.
# Correcciones de perfiles y espacio operativo — 2026-10-02

Biblioteca de películas: `npm test` pasó 30 pruebas; `scripts/qa-library.cjs` pasó 11/11 comprobaciones aisladas. Verifica lectura de metadatos reales, borrador fuera del catálogo, persistencia de borrador/publicación, reproducción, catálogo, perfil espectador con red desactivada, disponibilidad offline y ancho móvil. Compara tamaño y SHA-256 del archivo guardado en IndexedDB con el archivo MP4 original servido desde el repositorio: coincidieron. Se usó una copia de prueba de Caminandes en un contexto aislado, sin incorporar registros al navegador del usuario.

Historial de actividad: `scripts/qa-activity.cjs` verificó mensajes legibles, búsqueda traducida, filtro de descargas sin resultados, detalles técnicos desplegables, ancho móvil y ausencia de errores JavaScript. Los detalles abiertos se conservan al actualizar el historial. La lista usa títulos del catálogo y mensajes traducidos; los códigos originales permanecen dentro de los detalles.

Validación actual: `npm run check` (71 módulos), `npm test` (28 pruebas) y `scripts/qa-workspace.cjs` (14/14 comprobaciones en un contexto aislado, sin alterar los datos del navegador del usuario). Se verificaron vista previa del avatar, bloqueo de colores ocupados, persistencia de perfiles y registros, prioridad editorial visible en Inicio, clientes/facturas/abonos, cálculo regional con valores ingresados, importación JSON, distribución móvil y ausencia de errores JavaScript. Los valores de estas comprobaciones son fixtures del contexto aislado.
