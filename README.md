# Netflix Streaming Intelligence Platform

Prototipo académico. Este repositorio prepara infraestructura frontend; el estudiante completa manualmente el contenido evaluable y las decisiones académicas.

## Objetivo

TODO del estudiante: describir el objetivo aprobado de la actividad.

## Ejecución

Desde la carpeta del proyecto, ejecutar:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Abrir http://127.0.0.1:4173. Detener el servidor con Ctrl+C. Cualquier servidor HTTP estático con soporte MIME de JavaScript funciona. No abrir con `file://`: los módulos ES requieren HTTP. No necesita instalar dependencias para ejecutarse ni conectarse a una API.

Comprobaciones opcionales con Node:

```powershell
npm run check
npm test
```

## Estructura

```text
assets/       espacios para recursos aprobados; portadas actuales en CSS
css/          tokens, reset, base, layout, componentes, animaciones y pages/
js/           app, config/, data/, services/, components/, pages/, utils/
locales/      es, en, pt, fr, de, it, ja, ko, zh, ar
vendor/       Chart.js y jsVectorMap locales, mapa mundial y licencias
tests/        contratos técnicos con node:test
scripts/      comprobación estática y escenarios de navegador
docs/         arquitectura técnica, GitFlow, QA y TODOs del estudiante
```

Pantallas: Inicio, Series, Películas, Novedades, Mi lista, búsqueda, preferencias, cuenta, reproductor y operaciones. Las rutas usan hash y no necesitan configuración de rewrites del servidor.

## Dependencias

HTML5, CSS3 y JavaScript ES6+. Sin backend ni base de datos. Solo Chart.js 4.4.9 y jsVectorMap 1.6.0 para gráficos y mapa. Versiones y licencias en [vendor/README.md](vendor/README.md). Las distribuciones son locales; el navegador no usa CDN. Python sirve los archivos; Node y Playwright CLI son herramientas opcionales de QA.

## Ramas

GitFlow simplificado: `main` → `develop` → `feature/*`. Procedimiento en [docs/GITFLOW.md](docs/GITFLOW.md).

## Convenciones

Conventional Commits. Inspeccionar status y diff antes de agregar archivos intencionales. Colores propios en `css/tokens.css`; breakpoints en `css/layout.css`; cadenas de interfaz mediante `t()`. Nuevas páginas deben limpiar listeners, timers y observers al salir. Contratos en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Datos simulados

Solo ejemplos ficticios; no representan infraestructura, contenido ni métricas reales de Netflix. No es un producto oficial. Recomendaciones, streaming, ABR, casting, autenticación, pagos y política de escalabilidad quedan pendientes. La red solo valida entradas; los servicios y métricas son fixtures manuales. Las preferencias y Mi lista usan localStorage; no guardar secretos ni tarjetas.

Completar manualmente cada módulo siguiendo [docs/STUDENT-TODO.md](docs/STUDENT-TODO.md). No hay análisis académico final en este repositorio.

## Compatibilidad

Navegador moderno con módulos ES, `dialog`, CSS logical properties, `color-mix`, ResizeObserver y fullscreen. Español, inglés y árabe completos para el shell; otros siete idiomas parciales con fallback al inglés. RTL conserva LTR en la timeline y controles físicos. Evidencia y límites de verificación en [docs/QA.md](docs/QA.md). La revisión humana con lectores de pantalla y la compatibilidad entre motores requieren validación manual adicional.
