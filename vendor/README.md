# Dependencias locales

Solo dos librerías de ejecución, sin npm install, sin CDN en el navegador:

| Librería | Versión fijada | Archivos | Justificación |
| --- | --- | --- | --- |
| Chart.js | 4.4.9 | chart.umd.js, chart.LICENSE.md | Gráfico demo reusable y responsive |
| jsVectorMap | 1.6.0 | jsvectormap.min.js, jsvectormap.min.css, world.js, jsvectormap.LICENSE | Mapa mundial y tooltips de datos demo |

Distribuciones descargadas desde jsDelivr con versiones exactas. Se conservan sus licencias MIT. Los colores propios proceden de `css/tokens.css`; `THEME` consulta esos tokens para configurar las librerías. Los estilos internos de terceros se conservan y los visibles se ajustan desde `css/pages/operations.css`.

Fuentes oficiales: [integración de Chart.js](https://www.chartjs.org/docs/latest/getting-started/integration.html), [jsVectorMap](https://github.com/themustafaomar/jsvectormap).

TODO técnico: revisar changelog, licencias y compatibilidad antes de actualizar una distribución; repetir QA de operaciones. No retirar archivos requeridos para la ejecución local.
