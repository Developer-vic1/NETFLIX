# Guía de implementación manual

Este documento indica puntos de extensión técnicos. No contiene análisis, resultados, políticas de negocio ni algoritmos evaluables. El estudiante debe verificar la normativa de su actividad y completar el contenido con autoría personal.

| Módulo | Punto de entrada | Completar manualmente | Criterio técnico de integración |
| --- | --- | --- | --- |
| Objetivo académico | README.md | Objetivo, alcance y decisiones aprobadas | Identificar fuente y autoría del contenido |
| Catálogo e inicio | js/data/titles.js, js/pages/home.js | Metadatos, secciones y recursos gráficos aprobados; justificar tendencias | IDs únicos, estados vacíos, nombres accesibles y origen de los recursos |
| Recomendaciones | js/services/recommendation.service.js | Algoritmo y justificación académica | Conservar respuesta `{state, items, reason}` y probar ausencia de resultados |
| Regiones | js/config/regions.js | Matriz aprobada de disponibilidad; nombres localizados de países | Región independiente del idioma; comprobar tres estados y US + es |
| Idiomas | locales/*.js | Completar siete diccionarios parciales y revisar todas las traducciones con hablantes competentes | Fallback idioma → inglés → clave; nunca objetos o valores indefinidos |
| RTL | css/layout.css, css/components.css | Revisar nuevos componentes en árabe | Propiedades lógicas; no invertir play, volumen ni timeline |
| Reproductor | js/components/player.js, js/pages/player.js | Conectar medio local aprobado, play/pause/progreso, tracks y episodios | Manejar promesas, duración desconocida, errores multimedia y cleanup |
| Streaming | js/services/streaming.service.js | Definir y justificar algoritmo adaptativo y política de calidad | Validar entradas, marcar SIMULACIÓN, evitar afirmar mediciones reales |
| Casting | js/components/player.js | Definir contrato de dispositivo y límites del entorno | No indicar conexión o transmisión exitosa sin evidencia |
| Audio y subtítulos | js/pages/settings.js, js/components/player.js | Enlazar las preferencias a tracks aprobados | Mostrar disponibilidad parcial y no inferir audio desde región |
| Cuenta | js/pages/account.js, js/data/profiles.js | Contratos de identidad, perfiles y dispositivos | Datos ficticios; no guardar credenciales ni tokens en localStorage |
| Facturación | js/services/billing.service.js, js/data/plans.js | Contratos ficticios de plan, suscripción y facturas | Nunca solicitar tarjetas reales; listas vacías explícitas |
| Seguridad | js/pages/account.js | Definir autenticación y sesión aprobadas | La acción actual solo informa que no existe sesión autenticada |
| Notificaciones | js/components/notification-center.js | Conectar eventos aprobados, leído/no leído y sus preferencias | Respetar desactivación y mantener las seis categorías |
| Operaciones | js/pages/operations.js, js/data/metrics.js | Definir fixtures propios, escenarios e interpretación académica | Siempre indicar datos simulados; no atribuirlos a Netflix real |
| Gráficos | js/components/charts.js | Ampliar contratos de buffering, usuarios, requests, RAM y costes según alcance | Máximo 60 puntos, alternativa textual, destruir instancia al salir |
| Mapa | js/components/map.js | Completar fixtures regionales aprobados | Tooltip marcado como simulado y alternativa accesible de teclado |
| Incidentes | js/pages/operations.js | Severidad, estados, respuesta y recuperación | La UI debe sobrevivir a fallos y ofrecer información accionable |
| Escalabilidad | js/services/monitoring.service.js, js/pages/operations.js | Política y algoritmo aprobados | NORMAL/PRESSURE/SCALING/STABILIZED; no afirmar Kubernetes real |
| Validación | tests/, scripts/, docs/QA.md | Agregar pruebas para cada implementación nueva y revisión humana | Distinguir contrato técnico, algoritmo académico y mediciones reales |

## Contratos ya preparados

- `getRecommendations()`: devuelve un contrato vacío `NOT_IMPLEMENTED`.
- `getBillingSummary()`: devuelve facturas y métodos de pago vacíos.
- `networkPreview(mbps, quality)`: valida entradas y devuelve la calidad solicitada sin inferir adaptación ni medir red.
- `createMonitoringFixture()`: ciclo manual de estados sobre diez nombres de servicio. Es una fixture de UI, no un motor de fallos real.
- Escalabilidad: selector manual de estados; no calcula capacidad ni ejecuta infraestructura.
- Reproductor: `video` sin `src`; los botones explican su contrato pendiente. Volumen, configuración y fullscreen son controles técnicos.
- `myList`: persistencia local de IDs demo; no constituye una implementación de cuenta autenticada.

## Cómo añadir un módulo

1. Crear una rama feature desde `develop` limpio.
2. Identificar el contrato existente y completar únicamente el módulo autorizado.
3. Agregar sus textos a los diccionarios; usar `t()` y `textContent` mediante `el()`.
4. Reutilizar tokens, componentes y propiedades CSS lógicas. Añadir breakpoints exclusivamente a `css/layout.css`.
5. Devolver una función de cleanup si se crean listeners externos, observers o timers.
6. Probar entradas válidas e inválidas, estado vacío, error, offline y recuperación. No llenar resultados con datos inventados.
7. Ejecutar las verificaciones técnicas y revisión humana antes de integrar a `develop` y después a `main`.
