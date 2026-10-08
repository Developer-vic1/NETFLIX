# Reproducción y ventana flotante

La ventana flotante utiliza `requestPictureInPicture()` sobre el mismo elemento
`video` del reproductor. No abre otra página ni carga una segunda copia del archivo.
El botón se habilita cuando el navegador ha decodificado datos de video y declara
soporte. Mientras una petición está pendiente, el botón se bloquea para impedir
solicitudes simultáneas. Al salir de la página se cierra la ventana, se detiene la
observación, se retira la fuente y se libera el reproductor. Si el navegador
rechaza la ventana, la reproducción continúa y se muestra un mensaje específico.

## Videos grandes

El servidor local atiende solicitudes HTTP `Range` buscando directamente en el
archivo y leyendo bloques de hasta 64 KiB. Con conexión disponible, el Service
Worker deja pasar los videos locales al cargador nativo del navegador sin
interceptarlos ni crear un flujo intermedio. Si se detecta un fallo al cargar
la página desde el servidor o el navegador indica que está sin conexión, se
habilita la ruta de recuperación desde las descargas.

Si el servidor no está disponible, las descargas completas ya guardadas se
entregan desde Cache Storage mediante `ReadableStream`, respetando la velocidad
del consumidor. Se descartan los bloques anteriores al intervalo solicitado y
se cancela la lectura al completar el intervalo, al cerrar el consumidor o al
cancelarse la solicitud. No se usa `blob()` ni `arrayBuffer()` para materializar
el video completo en el Service Worker. Las descargas sin tamaño conocido se
entregan como respuesta completa en streaming, sin calcular un rango ficticio.

La caché antigua almacena cada descarga como un solo archivo: buscar cerca del
final sin el servidor requiere recorrer su prefijo. Esto limita memoria, pero
puede tardar más que la búsqueda directa del servidor. No se eliminan las
descargas existentes para introducir esta mejora.

Referencia: [Streams API de MDN](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API).

## Comprobaciones

Desde la raíz del proyecto:

```powershell
node --test tests/media-cache.test.js tests/picture-in-picture.test.js
npm.cmd test
npm.cmd run check
node --check sw.js
```

Las pruebas incluyen un flujo de 15 GiB generado bajo demanda, rangos cruzados,
sufijos, cancelación, ruta local sin caché y ciclo de vida de la ventana flotante.
El flujo grande es una prueba automatizada, no una medición de consumo real de
Opera. La captura de «Memoria insuficiente» por sí sola no permite identificar
si falló el proceso de video, la GPU, una extensión o el proceso de la página.
El heap JavaScript tampoco representa toda la memoria del navegador.

La prueba del capítulo 1 en el navegador integrado confirmó reproducción con
un solo elemento de video y respuestas HTTP 206 con `fromServiceWorker: false`.
Ese navegador rechaza la ventana flotante con
`NotSupportedError: Picture-in-Picture is not available`; el reproductor
continúa y muestra el aviso. Esta comprobación no certifica la ventana nativa
de Opera ni reproduce su cierre por falta de memoria.

Después de actualizar, recarga la página, espera a que se actualice el Service
Worker y vuelve a recargar antes de comprobar el cambio. Mantén abierto el
servidor Python durante la reproducción de los archivos locales.
