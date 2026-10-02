# Arquitectura técnica del scaffold

Aplicación estática servida por HTTP. HTML5 monta el shell; CSS define la identidad; módulos ES de JavaScript conectan componentes. Python solo sirve archivos durante desarrollo. Node es opcional para comprobaciones técnicas y Playwright CLI; no existe backend Node, API remota ni BD.

```text
index.html
  └─ js/app.js (router hash, shell, lifecycle)
       ├─ pages/* (montaje de pantallas; cleanup al salir)
       ├─ components/* (DOM, controles y adaptadores visuales)
       ├─ services/* (contratos técnicos y persistencia)
       ├─ config/* (límites, regiones e idiomas)
       └─ data/* (fixtures explícitas)
locales/* → localization.service.js → t(key, params)
css/tokens.css → CSS propio + theme.js → librerías visuales
```

## Contratos transversales

- El helper `el()` crea nodos con `textContent` para texto; no concatena HTML externo.
- El router permite home, series, movies, new, my-list, search, settings, account, player y operations. Un hash desconocido muestra error recuperable.
- Páginas con recursos externos devuelven cleanup. Operaciones destruye Chart y mapa, desconecta ResizeObserver y cancela su suscripción al event bus.
- Las preferencias usan una clave versionada y una allowlist. Fallos de almacenamiento no impiden cambiar el idioma de la sesión.
- Región e idioma se validan por separado. La matriz es demostrativa; UNAVAILABLE nunca bloquea el idioma de la interfaz.
- Español, inglés y árabe cubren el diccionario base. Otros idiomas usan traducciones parciales y fallback explícito al inglés. Nombres de regiones y etiquetas técnicas de protocolos permanecen como configuración de ejemplo.
- `dialog` nativo implementa modalidad y Escape. El componente añade focus trap, cierre por backdrop configurable y devolución de foco. El drawer reutiliza el mismo ciclo de vida.
- Breakpoints CSS centralizados en `layout.css`: 576, 768, 992, 1200 y 1440. Su contrato está reflejado en `app-config.js` porque CSS nativo no acepta custom properties en media queries.
- Dirección de lectura mediante `html.lang`/`html.dir` y propiedades lógicas. Controles físicos del reproductor y consola técnica mantienen LTR.
- Colores propios exclusivamente en `tokens.css`; `THEME.colors` los lee con `getComputedStyle`. Se conservan estilos y licencias de terceros en vendor.
- No hay intervalos de actualización ni algoritmos simulados automáticos. El usuario introduce o avanza fixtures manualmente. El event bus conserva 100 entradas y cada dataset 60 puntos como máximo.

## Estados

`stateView()` soporta loading, ready, empty, warning, error, offline, retrying y success. Las tarjetas admiten normal/ready, hover, focus, loading y error. Cada módulo nuevo debe conectar los estados que correspondan a su contrato; la disponibilidad del componente no prueba todos los flujos del futuro módulo.

## Límites deliberados

No están implementados: catálogo final, algoritmo de recomendaciones, ABR, streaming, tracks multimedia, casting, pagos, autenticación, incidentes y política de escalabilidad. Estos puntos están listados en STUDENT-TODO.md para completarse manualmente.
