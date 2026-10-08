# Aplicación Android y biblioteca sin computadora

La versión **1.2.0** incorpora conexión USB incremental, QR, estados de conexión y
descargas por Wi-Fi con selección de títulos, progreso, SHA-256 y reanudación. Consulta el procedimiento
actual en [Conexión al teléfono](CONEXION-TELEFONO.md). El procedimiento de exportación
manual de esta guía sigue disponible para preparar una carpeta transportable.

La aplicación funciona en **Android 8 o posterior**, lleva la interfaz instalada en el celular y reproduce archivos de una carpeta del propio dispositivo. La computadora se necesita para preparar y transferir la biblioteca; después puedes desconectarla. Los videos completos se transfieren aparte del APK, para que instalar o actualizar la aplicación no implique descargar de nuevo todas las películas. En Android esta entrega permite consultar y reproducir la biblioteca; la edición y publicación se realizan en el administrador de la computadora.

El instalador está en `releases/Netflix-Android.apk` y la carpeta que se transfiere por USB está en `output/android/Netflix-Biblioteca/`. El APK no contiene los videos de la biblioteca.

## 1. Preparar la biblioteca en Windows

Abre PowerShell **en la carpeta del proyecto**. Si lo abriste en otra ubicación, ejecuta:

```powershell
Set-Location 'C:\Users\LOQ\Desktop\UNIFRANZ\SEXTO SEMESTRE\INGENIERIA DE SOFTWARE\Netflix'
```

Python debe estar disponible. Este procedimiento lee la biblioteca guardada en `data/library/catalog.json`; no construye fichas a partir de videos sueltos ni incluye borradores.

Primero consulta los títulos publicados y el espacio necesario, sin copiar archivos:

```powershell
python scripts/export-mobile-library.py --list
```

El comando muestra los identificadores que puedes seleccionar. Para preparar **solo La isla de las tentaciones**:

```powershell
python scripts/export-mobile-library.py --title-id local-series-19bd42e0-7bd4-4727-ad82-e36b07a98b54 --output 'output/android/Netflix-Solo-Isla'
```

Para preparar **todos los títulos publicados**:

```powershell
python scripts/export-mobile-library.py --output 'output/android/Netflix-Biblioteca'
```

Usa una carpeta de destino nueva. Si ya existe, el programa se detiene para evitar mezclar dos versiones de la biblioteca. Puedes elegir otro nombre, por ejemplo `Netflix-Actualizada`. Repite `--title-id` para seleccionar varios títulos:

```powershell
python scripts/export-mobile-library.py --title-id IDENTIFICADOR_1 --title-id IDENTIFICADOR_2 --output 'D:\Transferencia\Netflix'
```

El programa valida las referencias y el tamaño completo de cada video. Conserva los identificadores, temporadas, números de capítulo, duraciones, metadatos y portadas. Los capítulos ausentes no se inventan ni se renumeran.

En el mismo volumen de Windows intenta crear enlaces de archivo para los videos: la carpeta de transferencia permite copiarlos al celular sin ocupar una segunda vez su tamaño en la computadora. Si el disco no admite enlaces, copia por bloques de 1 MiB y comprueba el tamaño final. Las portadas y el catálogo se copian de forma independiente. Los originales nunca se eliminan ni se recortan.

Si necesitas una copia totalmente independiente en la computadora, agrega `--copy`. Un video enlazado comparte su contenido con el original: utiliza la carpeta preparada para transferir, no para editar los videos.

La preparación publica la carpeta final únicamente cuando todos los archivos seleccionados están completos. Si falla por falta de espacio o por desconexión del disco, corrige la causa y repite el comando.

## 2. Copiar al celular por USB

1. Conecta el celular y selecciona **Transferencia de archivos** en la notificación USB de Android.
2. Copia la carpeta preparada `Netflix-Biblioteca` completa al almacenamiento interno del celular, dentro de `Download`. Conserva esta estructura:

```text
Download/
└── Netflix-Biblioteca/
    ├── data/
    │   └── library/
    │       ├── catalog.json
    │       └── covers/
    ├── videos/
    ├── series/
    └── assets/videos/library/  (si hay títulos que usan esta ruta)
```

3. Espera a que la copia termine. Revisa que el celular tenga suficiente espacio según el total mostrado por `--list`.
4. Transfiere también `releases/Netflix-Android.apk` e instálalo en el celular. Android puede pedirte permitir la instalación desde la aplicación con la que abriste el APK.
5. Abre la aplicación, pulsa **Carpeta** y continúa hasta el selector de carpetas de Android. Entra en `Download/Netflix-Biblioteca`, selecciona esa carpeta y confirma **Usar esta carpeta**.
6. La aplicación lee `data/library/catalog.json` y las rutas relativas de los videos y portadas. Comprueba Series, entra al título y reproduce un capítulo. Después desconecta el cable y vuelve a reproducirlo.

Selecciona la carpeta **Netflix-Biblioteca**, no la carpeta `Download` ni únicamente `series`. Si preparaste una selección con otro nombre, selecciona esa carpeta. Conserva los nombres de archivos: las rutas de `catalog.json` corresponden a esos nombres, incluidos los números de capítulo.

La biblioteca consultada el 8 de octubre de 2026 contiene 13 videos publicados: los 7 capítulos disponibles de La isla de las tentaciones y 6 películas. Videos y portadas suman **24 313 585 910 bytes (22,64 GiB)**. Para transferir esta selección completa conviene disponer de al menos **25 GiB libres** en el celular; vuelve a ejecutar `--list` si agregaste contenidos. Las películas y la serie conservan el tamaño del archivo original, sin compresión adicional ni recortes.

## 3. Actualizar el contenido

Publica o actualiza los títulos desde la computadora y prepara otra carpeta nueva con el exportador. Transfiere esa biblioteca completa al celular y selecciónala desde la aplicación. Los cambios de fichas realizados en la computadora se incluyen en el catálogo exportado; los archivos del celular no se sincronizan automáticamente con la computadora.

Para una primera transferencia pequeña selecciona solo una película o una serie. Transferir videos completos al teléfono requiere espacio físico en ese dispositivo, incluso cuando se usaron enlaces para preparar la carpeta en Windows.

### Transferencia por USB con Android SDK

Si Android ya autorizó la depuración USB y confirmaste el teléfono correcto, puedes
enviar la selección preparada desde la raíz del proyecto:

```powershell
python scripts/send-android.py --serial IDENTIFICADOR_DEL_TELEFONO
```

Consulta el identificador con `adb devices -l` usando `platform-tools/adb.exe` de tu
Android SDK. El programa exige un dispositivo concreto, comprueba espacio libre,
envía la APK a `Download/Netflix-Android.apk` y verifica su SHA-256. La biblioteca
se envía a `Download/Netflix-Biblioteca-cargando`, con porcentaje basado en bytes
escritos en el teléfono. Comprueba el tamaño de cada archivo y publica el catálogo
al final; solo entonces renombra la carpeta a `Netflix-Biblioteca`. No sobrescribe
una biblioteca existente ni elimina originales. Instala la APK desde Archivos y
conecta la carpeta cuando se confirme **TRANSFERENCIA COMPLETA**.

Si se interrumpe el cable, la carpeta con `-cargando` permanece incompleta y los
originales del equipo se conservan. El programa se detiene y permite revisar esa
carpeta antes de intentar otra transferencia.

## 4. Resolver problemas

| Problema | Revisión |
|---|---|
| No aparecen títulos | Selecciona la carpeta que contiene `data/library/catalog.json`; exporta títulos publicados. |
| Falta un capítulo o aparece un archivo no disponible | Comprueba que la transferencia USB terminó y que conservaste todos los archivos referenciados por el catálogo. No renombres videos manualmente. |
| El exportador dice que cambió el tamaño | El video original ya no coincide con la ficha guardada. Revisa o guarda de nuevo el título desde el administrador antes de exportar. |
| Destino existente | Usa una carpeta nueva. El exportador no sobrescribe bibliotecas anteriores. |
| Falta espacio | Ejecuta `--list`; selecciona menos títulos con `--title-id` o libera espacio en el dispositivo de destino. |
| La app perdió acceso a la carpeta | Vuelve a seleccionar la biblioteca. La carpeta debe mantenerse disponible en el dispositivo. |
| Un video no reproduce aunque está completo | El formato de archivo y sus códecs son cosas distintas. Conserva el original y comprueba compatibilidad del archivo con el dispositivo; la preparación no transcodifica. |

## Verificación del exportador

Desde la carpeta del proyecto:

```powershell
python -m unittest discover -s tests -p test_mobile_export.py
```

Las pruebas verifican películas y series, selección por título, exclusión de borradores, rutas codificadas con `#`, enlaces locales, copia alternativa, archivos completos, destino existente, falta de espacio y recuperación de errores sin modificar los originales. La comprobación de enlaces simbólicos puede omitirse cuando Windows no permite crearlos.

Preparar la carpeta y construir el APK no demuestra por sí solo reproducción en un celular real. La comprobación final se realiza instalando el APK, seleccionando la biblioteca transferida y reproduciendo con la computadora desconectada.

## Construir la aplicación desde el código

Necesitas Python 3, el JDK de Android Studio, Android SDK Platform 35 y Build Tools 35.0.0. El constructor prepara los recursos con `scripts/prepare-android-web.py`: no utiliza npm, Node.js, Gradle ni Flutter. Estas herramientas son para construir una APK nueva; el teléfono solo necesita instalar la APK ya preparada.
Desde PowerShell en la raíz `Netflix`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-android.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File android-local/tests/run.ps1
python -m unittest discover -s tests -p test_android_apk.py
python scripts/check-android-apk.py releases/Netflix-Android.apk
```

Si tus herramientas están en otras carpetas, indica `-SdkPath` y `-JdkPath` al constructor.
El resultado es `releases/Netflix-Android.apk`, firmado con una clave de desarrollo guardada
solo en `android-local/.keys/`. Esa clave no se sube a Git: consérvala para actualizar
la app sin cambiar su firma. Esta entrega sirve para instalación directa; no es una
publicación en Google Play. Los archivos generados se guardan en `android-local/build/`.

La APK empaqueta la interfaz y un servidor Java que escucha solo dentro del teléfono.
No requiere Python, la computadora, una cuenta ni conectividad de red para leer los
archivos transferidos. El permiso de carpeta de Android permite leer únicamente la
biblioteca seleccionada. Los videos se entregan por rangos con bloques de 64 KiB y se
comprueba su tamaño para detectar una transferencia incompleta.

La edición e importación de títulos se realiza en la computadora; la app móvil permite
ver el catálogo exportado, cambiar perfiles, conservar listas, progreso y preferencias,
y reproducir episodios. La ventana flotante nativa no está incluida en esta entrega;
sí se implementó la pantalla completa. La APK evita volver a descargar los videos que
ya están guardados en el teléfono. Los archivos MKV dependen de sus códecs y del WebView
del dispositivo; la exportación conserva el original.

### Corrección de la versión 1.0.2 y comprobación en teléfono

La versión 1.0.2 corrige un fallo del empaquetado en Windows: las cabeceras locales
del ZIP podían contener `www\\index.html`, aunque el índice central mostraba
`www/index.html`. Android no encontraba los archivos de la interfaz y mostraba
`library.sourceUnavailable` incluso con la carpeta correctamente conectada.
El constructor ahora normaliza ambas rutas antes de alinear y firmar la APK, y
verifica cada entrada después de firmarla. Si detecta una ruta incorrecta, archivos
faltantes, duplicados, videos privados o claves dentro de la APK, la compilación falla.

El 8 de octubre de 2026 se actualizó la aplicación instalada en un Redmi Note 14 Pro+
5G con Android 16, conservando la carpeta y los datos. Se comprobó la interfaz en
el dispositivo, el catálogo de siete títulos y la reproducción del episodio 1 de
La isla de las tentaciones a 720p, con avance del contador y cambio de fotogramas.
Además se compararon con los originales 40 respuestas por rangos del teléfono:
el comienzo y final de los 13 videos y las siete portadas. Esto valida la lectura y
el desplazamiento dentro de los archivos; no significa que se hayan reproducido
completos todos los videos o probado todos sus códecs.
Los 123 recursos de interfaz de la APK se consultaron al servidor de la aplicación
instalada y coincidieron byte por byte con los empaquetados.

También pasaron la firma APK v2/v3, 27 comprobaciones nativas de rangos y rutas y
cuatro pruebas de regresión del empaquetado. Actualiza instalando la APK nueva
sobre la anterior; no desinstales ni borres los datos. No necesitas copiar nuevamente
la biblioteca. Xiaomi puede impedir los toques por USB con `INJECT_EVENTS`:
en esa configuración, las comprobaciones visuales se realizan con los toques del
usuario y capturas del teléfono, sin cambiar los permisos de seguridad.

Referencias: [WebView de Android](https://developer.android.com/develop/ui/views/layout/webapps/webview),
[acceso a documentos](https://developer.android.com/reference/android/provider/DocumentsContract).
