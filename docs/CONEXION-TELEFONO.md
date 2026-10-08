# Conectar el teléfono y añadir videos por USB o Wi-Fi

## Archivos que debes abrir

Los tres archivos están en la **raíz del proyecto Netflix**, junto a `README.md`. Funcionan con Python 3, sin npm ni Node.js:

| Archivo | Para qué sirve |
| --- | --- |
| `Abrir-Netflix.bat` | Inicia la aplicación de la computadora y abre el navegador. El menú Conexiones reúne los accesos USB y Wi-Fi. |
| `Conectar-USB.bat` | Detecta un Android conectado, instala o actualiza la aplicación y envía los archivos pendientes de la biblioteca publicada. |
| `Compartir-WiFi.bat` | Abre el QR y comparte títulos publicados con Android mediante la red local. |

Abre el archivo correspondiente con doble clic. La carpeta de ejecución se configura
automáticamente, aunque lo abras desde otra ubicación. Los videos originales completos
permanecen en la computadora. La aplicación guarda o reutiliza la copia del teléfono
para reproducirla después sin cable, Wi-Fi ni computadora.

La computadora necesita **Python 3**. USB necesita además **Android SDK Platform-Tools**
con `adb`; el programa lo busca en `ANDROID_HOME`, `ANDROID_SDK_ROOT`, el SDK de Android
Studio de tu usuario y el `PATH`. No necesitas Flutter, un emulador ni Android Studio
para usar una APK ya construida.

## 1. Primera conexión por USB

1. Conecta el teléfono con un cable de datos y desbloquéalo.
2. Si todavía no autorizaste el equipo, activa Depuración USB y acepta la autorización
   en el teléfono. El archivo BAT te avisa si no encuentra un dispositivo autorizado.
3. Abre `Conectar-USB.bat` en la computadora.
4. Comprueba el modelo y el identificador que aparecen. Si hay varios equipos,
   elige su número. Escribe **SI** para comenzar con ese teléfono.
5. Espera la comprobación SHA-256. Este paso lee los videos para comprobar su
   contenido; puede tardar con una biblioteca grande, aunque no sea necesario reenviarla.
6. El programa instala la APK conservando los datos, envía los archivos pendientes,
   verifica la copia y publica el catálogo al terminar. Verás los bytes y el porcentaje.
7. La aplicación se abre en el teléfono. **Solo la primera vez**, pulsa **Carpeta**,
   selecciona `Download/Netflix-Biblioteca` y confirma **Usar esta carpeta**.
   Android exige que la elección y ese permiso los conceda el propietario del teléfono.

Puedes desconectar el cable cuando aparezca **LISTO**. Actualizar la APK sobre la
anterior conserva perfiles, listas, preferencias y permiso de carpeta.

### Agregar una película o nuevos capítulos por USB

Añade y publica el contenido en el administrador de la computadora. Para una serie,
guarda sus capítulos en la ficha de la serie. Después ejecuta `Conectar-USB.bat` otra vez.
El programa compara tamaños y SHA-256, conserva los archivos idénticos y envía los
pendientes. Si cambió el contenido bajo el mismo nombre, utiliza un nombre con hash
para no sobrescribir el video que todavía utiliza el catálogo anterior.

Si cancelas o desconectas el cable, el catálogo anterior sigue disponible. Al repetir,
los archivos completos ya enviados se reconocen. Una transferencia USB parcial se
reinicia; no se publica como video listo. El programa limpia solamente su temporal
propio cuando la conexión permite hacerlo. No elimina películas anteriores ni archivos
ajenos del teléfono.

## 2. Conectar mediante la misma Wi-Fi

1. Instala la versión **1.2.0 o posterior** de la aplicación mediante el acceso USB.
2. Conecta la computadora y el teléfono a la **misma red local**. Puede ser la Wi-Fi
   del router de casa; no necesitas activar un hotspot ni disponer de Internet.
3. Abre `Compartir-WiFi.bat` y mantén su ventana abierta durante la transferencia.
4. El BAT comprueba una regla limitada a Python, el puerto elegido, redes privadas
   y equipos de la subred local. Si falta, Windows pide permiso de administrador:
   el propietario debe autorizarlo. El programa verifica la regla antes de compartir.
5. Se abre una página con códigos **QR**, direcciones y el código de seis dígitos.
   Escanea el QR de la red que usa tu teléfono con su cámara y pulsa
   **Abrir Netflix Local y conectar**. Android abre la aplicación con los datos
   completos. Si la cámara no abre ese enlace, pulsa **Conectar** en la tarjeta
   del teléfono e introduce la dirección y el código del BAT manualmente.
6. Espera **Comprobando qué títulos ya están guardados**. Los títulos completos aparecen como **Ya guardado**, con su selección desactivada. Elige las películas o series pendientes y pulsa **Descargar**. En una serie se comprueban sus
   capítulos y se reciben los que falten. Los archivos idénticos se reutilizan.
7. Mantén la ventana de progreso abierta. Verás preparación, comprobación, descarga,
   verificación, bytes comprobados o guardados y tiempo transcurrido. Al finalizar aparece
   **Tu biblioteca está lista** y el catálogo se actualiza.

Después puedes cerrar el servidor, apagar la computadora o salir de la Wi-Fi.
La reproducción utiliza los archivos del teléfono. **Sin conexión no se pueden recibir
videos nuevos**: la red local se necesita durante su descarga.

### Estados visibles en el teléfono

La tarjeta superior distingue la conexión de red de los videos que ya están guardados:

Después de conectar, la tarjeta se oculta automáticamente para dejar espacio al catálogo. Puedes abrir **Menú → Conexiones** para consultar el estado, recibir títulos nuevos o pulsar **Mostrar conexión**. Si vuelves a mostrar la tarjeta, **Ocultar** la retira sin desconectarte. La página Conexiones de la computadora muestra el QR y el dispositivo USB real.

| Estado | Qué significa y qué puedes hacer |
| --- | --- |
| **Tu biblioteca en el teléfono** | La aplicación está abierta y los videos locales pueden consultarse. Pulsa **Conectar** para añadir contenido. |
| **Conectando con tu computadora** | Está comprobando la dirección y el código. |
| **Computadora conectada** (verde) | El servidor confirmó una sesión válida. Se muestra su dirección y la cantidad de títulos; pulsa **Ver títulos** para actualizar el catálogo. |
| **Guardando en tu teléfono** (ámbar) | Comprobación y descarga de la selección en curso, con progreso visible. |
| **Computadora sin conexión** | El servidor dejó de responder o caducó la sesión; los videos locales siguen disponibles. |
| **No se pudo conectar** | Se muestra la causa y una acción para reintentar. |

El indicador consulta una respuesta autenticada cada ocho segundos mientras la
aplicación está visible. Al cambiar de aplicación se pausa esa observación para
reducir actividad. No mantiene una conexión verde por haber conectado en el pasado.

### Nuevos títulos sin reiniciar el servidor

Publica el video o los nuevos capítulos en la computadora. Vuelve a conectar desde
**Menú → Conexiones → Buscar nuevos títulos** en el teléfono, o vincula nuevamente:
el servidor lee la biblioteca actual en cada consulta.
No necesitas editar direcciones de videos ni reconstruir la APK por cada película.
Puedes seleccionar solamente los títulos pendientes que quieras llevar contigo. Cambiar solo la sinopsis o la fecha de una ficha no vuelve a habilitar videos ya guardados. Una serie con capítulos nuevos muestra la cantidad pendiente y conserva los episodios anteriores.

Si se corta Wi-Fi o cancelas, las descargas parciales se conservan dentro de la app.
Al volver a conectar y elegir el mismo título, la aplicación continúa por rangos desde
lo guardado y verifica el archivo completo antes de incorporarlo. El catálogo anterior
se mantiene si algún archivo queda incompleto o no coincide con su SHA-256.

## 3. Dónde se guarda cada cosa

| Recurso | Ubicación |
| --- | --- |
| Videos originales de la computadora | `Netflix/videos/`, `Netflix/series/` o recursos publicados del catálogo. |
| Biblioteca enviada por USB | `Download/Netflix-Biblioteca/` en el teléfono. |
| Descargas de Wi-Fi | Almacenamiento de Netflix Local: `Android/data/com.netflix.local/files/library/`. |
| Catálogo de descargas Wi-Fi | `library/catalog.json`, guardado de forma atómica. |

Las descargas Wi-Fi usan nombres físicos basados en SHA-256, mientras que la interfaz
conserva el título y los capítulos del catálogo. Así se reutiliza contenido idéntico.
Android puede ocultar `Android/data` al explorador de archivos; consulta las descargas
desde la aplicación. **Desinstalar la aplicación elimina sus descargas Wi-Fi**;
actualizarla con el acceso USB las conserva. La carpeta USB permanece separada.

## 4. Si algo falla

| Mensaje o situación | Qué revisar |
| --- | --- |
| No hay Android autorizado | Cable de datos, pantalla desbloqueada y autorización de Depuración USB. |
| No se encuentra Python o adb | Python en PATH y Android SDK Platform-Tools en las rutas indicadas arriba. |
| Wi-Fi no conecta | Dirección actual del BAT, mismo router y ambos equipos en una red que permita comunicación entre clientes. Las redes de invitados pueden aislar dispositivos. |
| Windows solicita autorización | Autoriza el permiso de administrador para la regla privada de Netflix. Se limita a Python, su puerto y la subred local; no desactiva el firewall ni abre puertos del router. |
| Dirección cambió | Al cambiar de router puede cambiar la IP. Usa la que muestra el BAT en esa sesión. |
| Código o sesión caducó | Vuelve a vincular con el código actual. Reiniciar el BAT genera otro código. Los permisos de sesión duran dos horas. |
| Espacio insuficiente | Libera espacio en el teléfono. La app comprueba espacio para los pendientes y una reserva antes de descargar. |
| El video cambió o no coincide el SHA-256 | Vuelve a publicar la ficha en la computadora y reintenta. El archivo anterior no se sobrescribe. |
| Un MKV no reproduce | El contenedor MKV puede incluir códecs que el WebView del teléfono no decodifique. La transferencia conserva el original; no convierte ni recorta videos. |

## 5. Ejecutar manualmente o comprobar requisitos

Abre PowerShell en la raíz del proyecto:

```powershell
Set-Location 'C:\Users\LOQ\Desktop\UNIFRANZ\SEXTO SEMESTRE\INGENIERIA DE SOFTWARE\Netflix'
python scripts/connect-android.py --check
python scripts/connect-android.py
python scripts/share-library.py
```

`--check` detecta dispositivos y valida requisitos sin instalar ni enviar videos.
Para elegir explícitamente un teléfono usa `--serial IDENTIFICADOR`; igualmente
verás el modelo y confirmarás el destino. Si `adb` está en otra ruta:

```powershell
python scripts/connect-android.py --adb 'C:\Android\platform-tools\adb.exe'
```

Si el puerto Wi-Fi está ocupado, elige otro y escribe esa dirección completa en Android:

```powershell
python scripts/share-library.py --port 4186
```

Si la regla ya está configurada manualmente, puedes omitir su comprobación explícitamente:

```powershell
python scripts/start-wifi.py --skip-firewall
```

La aplicación admite únicamente direcciones IPv4 privadas y conexiones directas;
rechaza redirecciones y direcciones públicas. El servidor comparte solo archivos de
títulos publicados, exige vinculación y no expone herramientas de administración.
El transporte HTTP funciona dentro de la red local; úsalo en tu red de confianza.

## 6. Pruebas del procedimiento

```powershell
python -m unittest discover -s tests -p 'test_*.py'
powershell -NoProfile -ExecutionPolicy Bypass -File android-local/tests/run.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File android-local/tests/run-wifi.ps1
```

Las pruebas usan bibliotecas temporales para comprobar interrupciones, rangos,
SHA-256, selección de dispositivo, colisiones, autenticación y publicación atómica.
No envían las películas personales durante las pruebas automáticas de Python.

El 8 de octubre de 2026 se comprobó el circuito en un Redmi Note 14 Pro+ 5G,
Android 16, conectado a la misma Wi-Fi del router que la computadora:
**27 comprobaciones físicas** verificaron corte deliberado, descarga reanudada por
Range, SHA-256 completo, catálogo sin publicaciones parciales, persistencia y
sincronización repetida sin duplicados. Se utilizaron archivos aislados que se
limpiaron al finalizar; la biblioteca y las preferencias originales se conservaron.
También se verificó que el enlace del QR abre la aplicación con los siete títulos reales.
La comprobación de selección distingue videos guardados, metadatos actualizados y capítulos nuevos. En pantallas amplias, Conexiones también está disponible al pulsar el avatar.

Referencias: [almacenamiento específico de una aplicación Android](https://developer.android.com/training/data-storage/app-specific),
[configuración de red Android](https://developer.android.com/privacy-and-security/security-config).
