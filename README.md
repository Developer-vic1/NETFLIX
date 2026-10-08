# Netflix Streaming Intelligence Platform

Aplicación local de streaming para explorar un catálogo, reproducir películas y episodios, conservar descargas y observar la calidad de reproducción registrada en este navegador. El perfil Administrador permite añadir películas y series con varios episodios MP4 y consultar el centro operativo.

## Inicio rápido en Windows

Haz doble clic en **`Netflix.exe`** en la carpeta principal del proyecto. Abre el servidor local y la página en tu navegador. Requiere Python 3 instalado; el ejecutable es un iniciador pequeño y utiliza los archivos del proyecto, por lo que debes conservarlo junto a `index.html`, `scripts/` y `assets/`. Si Windows bloquea el ejecutable descargado, usa `Abrir Netflix.cmd`; este archivo también puede compilar el iniciador con `scripts/build-launcher.ps1` cuando esté disponible .NET Framework 4. El ejecutable no incluye los MP4 y no los modifica.

También puedes iniciar la aplicación manualmente:

Abre **PowerShell** en la carpeta del proyecto `Netflix` (puedes escribir `powershell` en la barra de direcciones del Explorador o abrir la terminal integrada de VS Code). Ejecuta:

```powershell
Set-Location -LiteralPath 'C:\Users\LOQ\Desktop\UNIFRANZ\SEXTO SEMESTRE\INGENIERIA DE SOFTWARE\Netflix'
python scripts/serve.py
```

La terminal debe mostrar `Local server: http://127.0.0.1:4173/#/home`. **Déjala abierta** mientras uses la aplicación. Abre [Inicio](http://127.0.0.1:4173/#/home) en el navegador. Para detener el servidor, vuelve a esa terminal y pulsa `Ctrl+C`.

Si la página ya abre en `127.0.0.1:4173`, el servidor está en marcha y no necesitas iniciarlo otra vez. Si el puerto está ocupado por otro proceso, ejecuta `python scripts/serve.py --port 4174` y abre `http://127.0.0.1:4174/#/home`. `npm start` ejecuta el mismo servidor si tienes Node.js. Para utilizar la aplicación no necesitas `npm install`, una cuenta externa ni una base de datos. **No abras `index.html` con `file://`**: los módulos JavaScript y los videos necesitan HTTP local.

## Procedimiento de uso

1. Abre Inicio. Desde el avatar de la esquina superior derecha elige **Víctor Asturizaga** o **Carla Encinas** para navegar como espectador. Cada perfil conserva su propia lista, historial, progreso y preferencias.
2. Abre una ficha y pulsa **Reproducir**. Puedes pausar, adelantar, ajustar volumen y calidad disponible, y continuar desde la posición guardada. Los episodios se seleccionan desde la ficha de su serie.
3. Para guardar un título sin red, pulsa **Descargar**, espera a ver **Disponible sin conexión** y abre **Descargas**. Los archivos descargados consumen espacio en el navegador.
4. Cambia al perfil **Administrador** desde el avatar. El centro operativo muestra sesiones, respuesta HTTP del catálogo, alertas e historial recogidos **en este navegador**. Usa el menú lateral para abrir cada sección y sus filtros o exportaciones.
5. En **Biblioteca de películas**, pulsa **Añadir película** o **Añadir serie**. Ambos botones abren sus formularios y enfocan el título.
6. Completa título, sinopsis de al menos 20 caracteres, año, género, clasificación por edad, idioma original y director o productora. Selecciona un **video `.mp4`** y una **portada JPG, PNG o WebP de hasta 12 MB**. Revisa duración, resolución y vista previa.
7. Para una serie, añade cada capítulo con temporada, número, título, descripción y su propio MP4. No se permiten dos episodios en la misma posición. Pulsa **Añadir episodio** antes de guardar la serie.
8. Pulsa **Guardar borrador** si el título aún no debe mostrarse, o **Guardar y publicar** para verlo en el catálogo, búsqueda y reproducción. Puedes editarlo o retirarlo del catálogo sin borrar el archivo guardado.

El formulario indica junto al selector por qué rechaza un archivo: extensión distinta de `.mp4`, contenedor inválido, video ilegible o portada no admitida. Cambiar solo la extensión de un archivo no lo convierte en MP4. Si faltan campos o archivos, muestra un aviso y enfoca el campo que requiere atención. La comprobación valida la cabecera y un fotograma decodificado; no inspecciona cada fotograma ni modifica el archivo.

## Dónde quedan los datos

| Dato | Lugar | Consecuencia |
| --- | --- | --- |
| Fichas de películas y series, episodios y portadas | IndexedDB de este navegador y origen (`netflix-library`) | Persisten al recargar en este navegador; si borras sus datos, tendrás que volver a registrar las fichas. |
| MP4 añadidos desde Administrador | `assets/videos/library/` en esta computadora | Se guardan completos con nombres únicos. No se suben a Git. Haz una copia de esta carpeta para moverlos a otro equipo. |
| Perfiles, listas, progreso y configuración | Almacenamiento local del navegador | Cada perfil conserva su estado en este origen. |
| Descargas | Almacenamiento del navegador gestionado por el Service Worker | Pueden reproducirse sin red tras completar la descarga. |
| Videos base | `assets/videos/` en este equipo | El servidor Python los entrega completos con solicitudes por rangos. |

**Conserva los MP4 y portadas originales.** Borrar los datos del sitio elimina fichas, portadas, descargas y preferencias, pero no borra los MP4 de la carpeta del equipo. El perfil Administrador es un rol local de interfaz; no es autenticación de servidor. Para pasar la biblioteca completa a otro equipo necesitas copiar la carpeta de videos y exportar/restaurar las fichas del navegador; el proyecto todavía no incluye esa migración.

## Comprobaciones: usa otra terminal PowerShell

Mantén el servidor abierto en la primera terminal. Abre una **segunda terminal** en la misma carpeta y ejecuta:

```powershell
Set-Location -LiteralPath 'C:\Users\LOQ\Desktop\UNIFRANZ\SEXTO SEMESTRE\INGENIERIA DE SOFTWARE\Netflix'
npm.cmd run check
npm.cmd test
```

`check` verifica sintaxis, importaciones, recursos y reglas de interfaz. `test` ejecuta pruebas unitarias. Estos comandos necesitan Node.js y npm; la reproducción normal solo necesita Python y un navegador moderno. La revisión actual comprobó **75 módulos y 33 pruebas unitarias**. `python -m unittest tests/test_media_server.py` comprueba además que el servidor rechaza formatos incorrectos y guarda el MP4 byte por byte.

Para probar la biblioteca en un navegador **aislado**, con el servidor activo, ejecuta en esa segunda terminal:

```powershell
npx.cmd --yes --package '@playwright/cli' playwright-cli -s=netflix-library open 'http://127.0.0.1:4173/'
npx.cmd --yes --package '@playwright/cli' playwright-cli -s=netflix-library run-code --filename scripts/qa-mp4-quick.cjs
npx.cmd --yes --package '@playwright/cli' playwright-cli -s=netflix-library run-code --filename scripts/qa-library.cjs
```

`npx` obtiene Playwright CLI si falta, así que esta comprobación requiere Internet la primera vez y un navegador disponible. Los escenarios anteriores fueron escritos para la versión que guardaba MP4 en IndexedDB; sus verificaciones internas de almacenamiento deben actualizarse al nuevo guardado en carpeta. Las capturas se guardan en `output/playwright/`.

Si añades o renombras recursos de la aplicación para su uso sin conexión, actualiza el manifiesto desde la raíz:

```powershell
node scripts/build-offline.mjs
```

No hace falta hacerlo al incorporar una película o serie desde Administrador: los MP4 nuevos se sirven desde la carpeta local.

## Comentarios técnicos y alcance

- `scripts/serve.py` sirve la aplicación **solo en `127.0.0.1`**, evita caché HTTP de desarrollo, admite rangos de bytes para adelantar videos y recibe MP4 validados en `/api/media`. Es una aplicación local, sin autenticación de servidor ni despliegue público.
- `js/app.js` inicia la interfaz y sus rutas; `js/pages/` monta pantallas; `js/components/film-library.js` construye los formularios; `js/services/library.service.js` valida los MP4, sube los archivos completos al servidor local y guarda las fichas en este navegador.
- El catálogo base tiene **nueve títulos**: ocho obras o piezas de Blender y el archivo de Spider-Man aportado al proyecto. Los MP4 se excluyen de Git por su tamaño. En otro checkout puedes preparar los ocho videos de Blender con `.\scripts\cache-videos.ps1` si tienes conexión. El archivo aportado se copia con `.\scripts\import-local-video.ps1`, que compara SHA-256 y no lo recorta.
- La consola de operaciones utiliza mediciones y registros **de este navegador**. Las prioridades regionales y valores que introduzcas se incorporan a cálculos locales; no representan métricas mundiales de Netflix.
- No hay autenticación de servidor, facturación externa, CRM, modelo ML conectado, adaptación automática de video ni infraestructura global desplegada. Estas integraciones requieren servicios y datos propios.

Consulta [Arquitectura](docs/ARCHITECTURE.md), [Centro operativo](docs/CONTROL-ROOM.md), [QA](docs/QA.md), [Guía de implementación](docs/STUDENT-TODO.md) y [GitFlow](docs/GITFLOW.md) para los detalles y límites de cada módulo.

## Si algo no funciona

| Síntoma | Qué comprobar |
| --- | --- |
| No abre `127.0.0.1:4173` | Confirma que la primera terminal sigue abierta y muestra `Local server`. |
| `python` no se reconoce | Prueba `py -3 scripts/serve.py`; instala Python si tampoco está disponible. |
| Puerto 4173 ocupado | Usa el servidor ya abierto o inicia este proyecto en 4174. |
| La página conserva una versión anterior | Recarga con `Ctrl+R`. |
| No aparece Administrador | Abre el avatar y cambia de perfil. |
| No se guarda una película | Lee el mensaje junto al archivo o campo; confirma MP4 real, portada admitida y espacio libre. |
| El video base no reproduce en otro checkout | Ejecuta `.\scripts\cache-videos.ps1` desde la raíz o incorpora un MP4 propio. |
| `npm.cmd` o `npx.cmd` no se reconoce | Instala Node.js para ejecutar las comprobaciones; no es necesario para abrir la aplicación. |
