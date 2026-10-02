# Evidencia técnica de QA

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
