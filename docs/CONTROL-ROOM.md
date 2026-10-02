# Control operativo y catálogo local

El centro operativo sirve para revisar la reproducción realizada en este navegador, comparar sesiones, registrar seguimiento de incidencias y comprobar la entrega de contenido local. Su origen de datos se indica en pantalla y en los informes: `THIS_BROWSER`.

## Recorrido

1. Reproducir una película o un episodio desde un perfil de espectador.
2. Cambiar al perfil Administrador desde el avatar.
3. Revisar Vista general: respuesta HTTP del catálogo, inicio P95, esperas, fotogramas perdidos, tiempo observado y mapa de regiones seleccionadas con actividad.
4. Abrir Sesiones de reproducción y elegir una fila. Se conservan perfil, título, región, resolución, calidad, inicio, tiempo reproducido y esperas. Comparar dos sesiones muestra segunda menos primera; no prueba causalidad.
5. En Alertas y seguimiento, ajustar umbrales y revisar nuevas mediciones que los superen. Cambiar una alerta a En revisión o Resuelta y añadir notas conserva su seguimiento.
6. En Servicios y conexiones, ejecutar las cuatro comprobaciones reales: catálogo HTTP, lectura/escritura temporal, almacenamiento offline y entrega parcial de video.
7. Buscar eventos y exportar informes JSON o sesiones CSV.

Los filtros de región, período y título se aplican a las observaciones correspondientes. Servicios comprueba componentes locales y oculta esos filtros porque no necesita segmentarlos. El país es la preferencia seleccionada, sin inferir geolocalización o monitoreo remoto.

## Biblioteca de películas

En el perfil Administrador, Biblioteca de películas acepta únicamente archivos `.mp4` y una portada JPG/PNG/WebP de hasta 12 MB. Valida extensión, MIME declarado, la caja `ftyp` y marca compatible del contenedor ISO Base Media File Format. El navegador debe leer duración y resolución y decodificar el primer fotograma antes de permitir el guardado. Esta comprobación detecta archivos renombrados y codecs que este navegador no puede iniciar; no equivale a examinar cada fotograma del largometraje. Requiere título, sinopsis de 20 a 2000 caracteres, año, género, clasificación por edad, idioma original y director/productora. La vista previa permite revisar el archivo antes de guardarlo. El idioma y la clasificación son metadatos ingresados, sin doblaje ni control parental automático.

Guardar borrador conserva el registro sin mostrarlo al espectador. Guardar y publicar incorpora la película a Películas, búsqueda, Mi lista y reproducción. Editar conserva el identificador y admite reemplazar el video o la portada. La biblioteca incluye búsqueda por título, género o productora; filtros por estado; recuento de películas y espacio; y acciones rápidas para publicar o retirar un título del catálogo sin eliminar sus archivos. Los registros anteriores que no sean MP4 se conservan para reemplazar su archivo, pero no se incorporan al catálogo al cargar.

IndexedDB `netflix-library`, almacén `films`, conserva los archivos originales como Blob/File junto con los metadatos. La escritura es transaccional; el catálogo se actualiza después de completar la transacción. No recorta ni transcodifica los videos ni crea resoluciones adicionales. Los videos incorporados ya están disponibles offline y no se duplican en Cache Storage. Los datos pertenecen a este navegador y origen: borrar datos del sitio los elimina; no es almacenamiento compartido entre dispositivos ni un servicio de publicación externa. La comprobación de administrador corresponde a los perfiles locales, no a autenticación de servidor.

Referencias de implementación: [MPEG: estructura de cajas y `ftyp`](https://mpeg.chiariglione.org/standards/mpeg-4/iso-base-media-file-format.html), [MDN: almacenamiento local de videos con IndexedDB](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Client-side_APIs/Client-side_storage), [MDN: formatos de video](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Containers). La comprobación de cuota y los errores de almacenamiento permiten reintentar sin vaciar el formulario.

## Historial y conservación

`operations-store.service.js` guarda hasta 120 sesiones, 240 sondeos, 80 alertas y 160 eventos. Mantiene el historial después de recargar. Rechaza registros incompatibles, normaliza valores corruptos y permite exportar datos cuando el almacenamiento falla. Borrar datos del sitio elimina este historial.

El tiempo observado acumula intervalos de reproducción y excluye saltos de posición. El tiempo inicial va desde `play` hasta el primer evento `playing`. Las esperas se registran después de comenzar, excluyendo pausas y búsquedas. `getVideoPlaybackQuality()` proporciona fotogramas; los contadores conservan los segmentos al cambiar de fuente. El porcentaje perdido se pondera por el total de fotogramas, sin promediar porcentajes de sesiones de diferente duración.

Los umbrales producen alertas sobre observaciones nuevas. No ejecutan un modelo predictivo ni cambian automáticamente la calidad. El espacio de trabajo de Servicios incorpora registros locales: prioridades regionales del catálogo que aparecen en Inicio, clientes, facturas y registro de abonos. Estos abonos actualizan el saldo registrado; no procesan transacciones bancarias.

La planificación regional calcula tráfico de origen y costo por hora usando usuarios concurrentes, Mbps, porcentaje de caché, nodos y tarifas ingresadas. Es una estimación de planificación, separada de la calidad observada del reproductor. No representa infraestructura desplegada. Los registros se conservan en `nsip.workspace.v1`, se exportan en JSON y se importan con validación completa antes de escribir. Una importación inválida conserva los registros anteriores. El archivo debe contener `version: 1` y las colecciones `curation`, `customers`, `invoices` y `regions`; exportar el espacio vacío proporciona la estructura inicial.

## Movimiento con función

La selección de sección usa transiciones visuales y un indicador activo en la navegación. Las vistas grandes usan entradas CSS; las secciones administrativas pequeñas pueden usar View Transitions para evitar capturar páginas extensas y bloquear la navegación. Los cambios rápidos cancelan la transición anterior.

Las métricas interpolan visualmente entre dos valores observados durante 420 ms. El valor accesible y `data-measurement` se actualizan inmediatamente con el resultado final; las exportaciones contienen los datos originales. Las nuevas alertas animan su contador. Las comprobaciones de servicios aparecen cuando llega su resultado real. El reproductor, mapa, gráficos, observadores y animaciones liberan recursos al salir. Movimiento reducido evita estas animaciones.

## Archivo aportado por el usuario

`SPIDERMAN BRAND NEW DAY.mp4` se copió completo a `assets/videos/spiderman-brand-new-day-original.mp4`, sin recortar ni transcodificar. Tamaño: 3.754.810.041 bytes. SHA-256 idéntico en original y copia:

```text
36919DFFCAF8276BC8387FECD608B4F5593A2A0A9E1AE92AE91EE283756B158E
```

El navegador verificó duración de 8.678,016 segundos, video de 1920 × 800, decodificación y avance al minuto cinco. La ficha usa el nombre aportado y la portada/metadatos de la [página de Sony Pictures](https://www.sonypictures.com/movies/spidermanbrandnewday). La comprobación técnica no autentica la identidad editorial del archivo. Tendencias es una selección local del catálogo, sin presentar rankings de popularidad global.

Los videos se excluyen de Git. `scripts/import-local-video.ps1` vuelve a copiar y compara el hash; `scripts/cache-videos.ps1` prepara los ocho videos de Blender. La reproducción local sirve el archivo completo mediante rangos. Guardarlo offline requiere espacio suficiente para otra copia en el navegador; la descarga de este archivo grande no forma parte de la validación offline del episodio.

## Recursos técnicos

- [View Transitions — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition).
- [Calidad de reproducción — MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/getVideoPlaybackQuality).
- [Picture-in-picture — MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestPictureInPicture).

La cuenta administrativa sigue siendo un perfil local. Este frontend no sustituye autenticación de servidor ni acceso a sistemas de producción de Netflix.
