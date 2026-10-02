# Netflix Streaming Intelligence Platform

Aplicación local de streaming para explorar un catálogo, reproducir películas y episodios, conservar descargas y observar la calidad de reproducción registrada en este navegador. El perfil Administrador permite añadir películas MP4 y consultar el centro operativo.

## Inicio rápido en Windows

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
5. En **Biblioteca de películas**, pulsa **Añadir película**. El botón abre el formulario y enfoca el título.
6. Completa título, sinopsis de al menos 20 caracteres, año, género, clasificación por edad, idioma original y director o productora. Selecciona un **video `.mp4`** y una **portada JPG, PNG o WebP de hasta 12 MB**. Revisa duración, resolución y vista previa.
7. Pulsa **Guardar borrador** si el título aún no debe mostrarse, o **Guardar y publicar** para verlo en Películas, búsqueda y reproducción. Puedes editarlo o retirarlo del catálogo sin borrar el archivo guardado.

El formulario indica junto al selector por qué rechaza un archivo: extensión distinta de `.mp4`, contenedor inválido, video ilegible o portada no admitida. Cambiar solo la extensión de un archivo no lo convierte en MP4. Si faltan campos o archivos, muestra un aviso y enfoca el campo que requiere atención. La comprobación valida la cabecera y un fotograma decodificado; no inspecciona cada fotograma ni modifica el archivo.

## Dónde quedan los datos

| Dato | Lugar | Consecuencia |
| --- | --- | --- |
| Películas añadidas | IndexedDB de este navegador y origen (`netflix-library`) | Persisten al recargar; no se comparten entre equipos. |
| Perfiles, listas, progreso y configuración | Almacenamiento local del navegador | Cada perfil conserva su estado en este origen. |
| Descargas | Almacenamiento del navegador gestionado por el Service Worker | Pueden reproducirse sin red tras completar la descarga. |
| Videos base | `assets/videos/` en este equipo | El servidor Python los entrega completos con solicitudes por rangos. |

**Conserva los MP4 y portadas originales.** Borrar los datos del sitio elimina también las películas añadidas, descargas y preferencias. El perfil Administrador es un rol local de interfaz; no es autenticación de servidor.

## Comprobaciones: usa otra terminal PowerShell

Mantén el servidor abierto en la primera terminal. Abre una **segunda terminal** en la misma carpeta y ejecuta:

```powershell
Set-Location -LiteralPath 'C:\Users\LOQ\Desktop\UNIFRANZ\SEXTO SEMESTRE\INGENIERIA DE SOFTWARE\Netflix'
npm.cmd run check
npm.cmd test
```

`check` verifica sintaxis, importaciones, recursos y reglas de interfaz. `test` ejecuta pruebas unitarias. Estos comandos necesitan Node.js y npm; la reproducción normal solo necesita Python y un navegador moderno. La revisión actual comprobó **74 módulos y 31 pruebas unitarias**.

Para probar la biblioteca en un navegador **aislado**, con el servidor activo, ejecuta en esa segunda terminal:

```powershell
npx.cmd --yes --package '@playwright/cli' playwright-cli -s=netflix-library open 'http://127.0.0.1:4173/'
npx.cmd --yes --package '@playwright/cli' playwright-cli -s=netflix-library run-code --filename scripts/qa-mp4-quick.cjs
npx.cmd --yes --package '@playwright/cli' playwright-cli -s=netflix-library run-code --filename scripts/qa-library.cjs
```

`npx` obtiene Playwright CLI si falta, así que esta comprobación requiere Internet la primera vez y un navegador disponible. Los escenarios crean contextos aislados: **no añaden películas al navegador donde trabajas**. El primero comprueba apertura del formulario, avisos, rechazo de archivos, publicación y filtros; el segundo comprueba reproducción, persistencia, igualdad SHA-256 del MP4 íntegro y acceso sin red. En esta revisión pasaron **13/13** y **11/11** comprobaciones. Las capturas se guardan en `output/playwright/`.

Si añades o renombras recursos de la aplicación para su uso sin conexión, actualiza el manifiesto desde la raíz:

```powershell
node scripts/build-offline.mjs
```

No hace falta hacerlo al incorporar una película desde Administrador: ya se guarda íntegra en IndexedDB.

## Comentarios técnicos y alcance

- `scripts/serve.py` sirve la aplicación **solo en `127.0.0.1`**, evita caché HTTP de desarrollo y admite rangos de bytes para adelantar videos. No es un backend de producción.
- `js/app.js` inicia la interfaz y sus rutas; `js/pages/` monta pantallas; `js/components/film-library.js` construye el formulario; `js/services/library.service.js` valida el MP4 y guarda películas.
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
