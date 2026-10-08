"""Install/update Android and synchronize complete published media over USB.

No remote video is overwritten or deleted. Changed content receives a hash name;
the catalog is published only after all its files have passed SHA-256 verification.
"""
import argparse
from copy import deepcopy
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
from urllib.parse import quote, unquote
import uuid
import zipfile

ROOT = Path(__file__).resolve().parent.parent
DESTINATION = '/sdcard/Download/Netflix-Biblioteca'
CATALOG = 'data/library/catalog.json'
MAX_CATALOG = 8 * 1024 * 1024
CHUNK = 1024 * 1024


def parse_devices(output):
    """Only authorized physical USB transports; never guess a TCP/emulator target."""
    devices = []
    for line in output.splitlines():
        fields = line.split()
        if len(fields) < 2 or fields[1] != 'device':
            continue
        serial = fields[0]
        if ':' in serial or serial.startswith('emulator-') or serial.endswith('._tcp'):
            continue
        if not re.fullmatch(r'[A-Za-z0-9_.-]+', serial):
            continue
        properties = dict(field.split(':', 1) for field in fields[2:] if ':' in field)
        devices.append({'serial': serial, 'model': properties.get('model', 'Android').replace('_', ' ')})
    return devices


def choose_device(devices, read=input, report=print, serial=None):
    if not devices:
        raise RuntimeError('No hay un Android autorizado por USB. Desbloquéalo, activa Depuración USB y acepta la autorización del equipo.')
    for index, device in enumerate(devices, 1):
        report(f'{index}. {device["model"]} · USB {device["serial"]}')
    if serial:
        matching = [device for device in devices if device['serial'] == serial]
        if len(matching) != 1:
            raise RuntimeError('El teléfono solicitado no está disponible por USB.')
        chosen = matching[0]
    elif len(devices) == 1:
        chosen = devices[0]
    else:
        value = read('Número del teléfono que deseas actualizar: ').strip()
        if not value.isdigit() or not 1 <= int(value) <= len(devices):
            raise RuntimeError('Selección no válida. No se modificó ningún teléfono.')
        chosen = devices[int(value) - 1]
    answer = read(f'¿Instalar y sincronizar en {chosen["model"]} ({chosen["serial"]})? Escribe SI: ').strip().casefold()
    if answer not in ('si', 'sí'):
        raise RuntimeError('Operación cancelada. No se modificó ningún teléfono.')
    return chosen


def locate_adb(explicit=None):
    candidates = [explicit] if explicit else []
    for name in ('ANDROID_HOME', 'ANDROID_SDK_ROOT'):
        if os.environ.get(name):
            candidates.append(Path(os.environ[name]) / 'platform-tools/adb.exe')
    candidates.append(Path(os.environ.get('LOCALAPPDATA', '')) / 'Android/Sdk/platform-tools/adb.exe')
    candidates.append(shutil.which('adb'))
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return str(Path(candidate).resolve())
    raise RuntimeError('No se encuentra adb. Instala Android SDK Platform-Tools y configura ANDROID_HOME, o usa --adb con su ruta.')


def validate_apk(path):
    if not path.is_file():
        raise RuntimeError('No existe releases/Netflix-Android.apk. Genera la APK antes de conectar el teléfono.')
    try:
        with zipfile.ZipFile(path) as archive:
            names = set(archive.namelist())
            if not {'AndroidManifest.xml', 'classes.dex'} <= names or archive.testzip():
                raise RuntimeError('La APK está incompleta o dañada; no se instaló.')
    except zipfile.BadZipFile as error:
        raise RuntimeError('El archivo APK no tiene un formato válido.') from error


def relative_path(value):
    if not isinstance(value, str) or not value or any(char in value for char in '\\\0\r\n'):
        raise ValueError('Ruta de biblioteca no válida.')
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in ('', '.', '..') for part in value.split('/')):
        raise ValueError('La ruta sale de la biblioteca.')
    if not re.fullmatch(r'(?:videos|series|assets/videos/library)/[A-Za-z0-9_#.-]+\.(?:mp4|mkv)|data/library/covers/[A-Za-z0-9_-]+\.(?:jpg|png|webp)|data/library/catalog\.json', value):
        raise ValueError('La ruta no pertenece a los recursos publicados.')
    return value


def remote_path(relative):
    return DESTINATION + '/' + relative_path(relative)


def hash_file(path):
    before = path.stat()
    digest = hashlib.sha256()
    with path.open('rb') as reader:
        while block := reader.read(CHUNK):
            digest.update(block)
    after = path.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise RuntimeError('El archivo cambió mientras se verificaba: ' + path.name)
    return digest.hexdigest()


def hash_name(relative, digest):
    relative_path(relative)
    if not re.fullmatch(r'[a-f0-9]{64}', digest):
        raise ValueError('SHA-256 no válido.')
    path = PurePosixPath(relative)
    # Bound names to keep Android/FAT provider filename limits well below 255.
    return relative_path(str(path.with_name(path.stem[:120] + '_' + digest + path.suffix)))


def catalog_bytes(records, replacements):
    records = deepcopy(records)
    for record in records:
        cover = record['coverUrl']
        record['coverUrl'] = replacements[unquote(cover)]
        descriptors = [record['video']] if record['kind'] == 'movie' else [episode['video'] for episode in record['episodes']]
        for descriptor in descriptors:
            relative = replacements[unquote(descriptor['url'])]
            descriptor['url'] = quote(relative, safe='/')
            descriptor['name'] = PurePosixPath(relative).name
    data = json.dumps({'version': 1, 'records': records}, ensure_ascii=False, allow_nan=False, indent=2).encode('utf-8')
    if len(data) > MAX_CATALOG or len(records) > 1000:
        raise RuntimeError('El catálogo supera los límites que admite Android.')
    return data


def sync_plan(plan, inspect, report=print):
    """Resolve collisions without touching existing media or requiring a PC copy."""
    files, replacements = [], {}
    total = len(plan['files'])
    for index, (relative, item) in enumerate(plan['files'].items(), 1):
        relative_path(relative)
        report(f'[{index}/{total}] Verificando {relative} ({item["size"] / 1024 ** 2:.1f} MiB)…')
        digest = hash_file(item['path'])
        if item['path'].stat().st_size != item['size']:
            raise RuntimeError('El tamaño del archivo cambió: ' + relative)
        destination = relative
        existing = inspect(destination)
        identical = existing is not None and existing == (item['size'], digest)
        if existing is not None and not identical:
            destination = hash_name(relative, digest)
            existing = inspect(destination)
            identical = existing is not None and existing == (item['size'], digest)
            if existing is not None and not identical:
                raise RuntimeError('Existe una colisión de contenido en ' + destination + '. No se sobrescribió ningún archivo.')
        replacements[relative] = destination
        files.append({**item, 'relative': destination, 'hash': digest, 'skip': identical})
        report('  Ya está verificado en el teléfono.' if identical else '  Preparado para enviar sin sobrescribir videos.')
    return {'files': files, 'catalog': catalog_bytes(plan['records'], replacements),
            'bytes': sum(item['size'] for item in files if not item['skip']), 'records': len(plan['records'])}


class AndroidUsb:
    def __init__(self, adb, serial, report=print):
        self.prefix = [adb, '-s', serial]
        self.report = report
        self.completed = 0
        self.total = 0

    def run(self, *values, check=True, timeout=120):
        result = subprocess.run(self.prefix + list(values), capture_output=True, text=True,
                                encoding='utf-8', errors='replace', timeout=timeout)
        if check and result.returncode:
            raise RuntimeError(result.stderr.strip() or result.stdout.strip() or 'Se interrumpió la conexión USB.')
        return result.stdout.strip()

    def shell(self, command, check=True, timeout=120):
        return self.run('shell', command, check=check, timeout=timeout)

    def inspect(self, relative):
        remote = shlex.quote(remote_path(relative))
        output = self.shell(f'if [ ! -e {remote} ]; then echo MISSING; elif [ -f {remote} ]; then stat -c %s {remote}; sha256sum {remote}; else echo INVALID; fi', timeout=1800)
        if output == 'MISSING':
            return None
        lines = output.splitlines()
        if len(lines) != 2 or not lines[0].isdigit() or not re.match(r'^[a-fA-F0-9]{64}\s', lines[1]):
            raise RuntimeError('No se pudo verificar el archivo del teléfono: ' + relative)
        return int(lines[0]), lines[1].split()[0].lower()

    def check_catalog(self):
        """Do not replace an unrelated catalog occupying the selected app folder."""
        remote = shlex.quote(remote_path(CATALOG))
        status = self.shell(f'if [ ! -e {remote} ]; then echo MISSING; elif [ -f {remote} ]; then stat -c %s {remote}; else echo INVALID; fi')
        if status == 'MISSING':
            return
        if not status.isdigit() or int(status) > MAX_CATALOG:
            raise RuntimeError('El catálogo existente no es válido. Se conservó para revisarlo antes de sincronizar.')
        try:
            old = json.loads(self.shell('cat ' + remote))
            if not isinstance(old, dict) or old.get('version') != 1 or not isinstance(old.get('records'), list):
                raise ValueError()
            for record in old['records']:
                if not isinstance(record, dict) or not re.fullmatch(r'local-(?:series-)?[a-f0-9-]{36}', record.get('id', '')):
                    raise ValueError()
        except (json.JSONDecodeError, ValueError, TypeError) as error:
            raise RuntimeError('La carpeta contiene un catálogo ajeno o dañado. Se conservó; revisa Download/Netflix-Biblioteca.') from error

    def free_bytes(self):
        output = self.shell('df -k /sdcard').splitlines()
        try:
            return int(output[-1].split()[3]) * 1024
        except (ValueError, IndexError) as error:
            raise RuntimeError('No se pudo medir el espacio disponible del teléfono.') from error

    def transfer(self, item, replace_catalog=False):
        """Push to an owned random partial path; verify before the final rename."""
        destination = remote_path(item['relative'])
        temporary = destination + '.netflix-transfer-' + uuid.uuid4().hex + '.part'
        folder = destination.rsplit('/', 1)[0]
        self.shell('mkdir -p ' + shlex.quote(folder))
        self.shell('test ! -e ' + shlex.quote(temporary))
        process = None
        try:
            process = subprocess.Popen(self.prefix + ['push', '-Z', str(item['path']), temporary],
                                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                                       encoding='utf-8', errors='replace')
            while True:
                try:
                    output, _ = process.communicate(timeout=20)
                    if process.returncode:
                        raise RuntimeError(output.strip() or 'Se interrumpió el envío USB.')
                    break
                except subprocess.TimeoutExpired:
                    current = self.shell('stat -c %s ' + shlex.quote(temporary), check=False)
                    received = min(item['size'], int(current)) if current.isdigit() else 0
                    self.progress(received)
            output = self.shell('stat -c %s ' + shlex.quote(temporary) + '; sha256sum ' + shlex.quote(temporary), timeout=1800).splitlines()
            if len(output) != 2 or output[0] != str(item['size']) or output[1].split()[0].lower() != item['hash']:
                raise RuntimeError('La copia no pasó la verificación SHA-256: ' + item['relative'])
            # Media names must stay free. Catalog is the only explicitly replaceable app file.
            if replace_catalog:
                if item['relative'] != CATALOG:
                    raise RuntimeError('Sólo se permite actualizar el catálogo de Netflix.')
                self.check_catalog()
                self.shell('mv -f ' + shlex.quote(temporary) + ' ' + shlex.quote(destination))
            else:
                # Toybox mv -n does not overwrite a raced destination; verify the
                # owned temporary disappeared before reporting publication.
                self.shell('mv -n ' + shlex.quote(temporary) + ' ' + shlex.quote(destination) + ' && test ! -e ' + shlex.quote(temporary))
            self.completed += item['size']
            self.progress(0)
        finally:
            if process is not None and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
            # Exact random path created by this transfer; no wildcard/folder removal.
            try:
                self.shell('rm -f ' + shlex.quote(temporary), timeout=10)
            except (RuntimeError, subprocess.TimeoutExpired, OSError):
                self.report('Quedó un envío parcial sin publicar: ' + temporary)

    def progress(self, received):
        percent = min(100, (self.completed + received) * 100 / max(1, self.total))
        self.report(f'Progreso real de envío: {percent:.1f}% · {(self.completed + received) / 1024 ** 3:.2f} / {self.total / 1024 ** 3:.2f} GiB')


def load_export_plan(root):
    source = ROOT / 'scripts/export-mobile-library.py'
    spec = importlib.util.spec_from_file_location('usb_mobile_export', source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.plan_export(root)


def main(argv=None):
    parser = argparse.ArgumentParser(description='Instala Netflix Local y actualiza por USB sólo los archivos pendientes.')
    parser.add_argument('--adb', type=Path)
    parser.add_argument('--serial', help='Filtra el teléfono; igualmente se solicitará confirmación.')
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--check', action='store_true', help='Verifica requisitos locales y detecta USB, sin instalar ni transferir.')
    args = parser.parse_args(argv)
    report = lambda message: print(message, flush=True)
    apk = args.root.resolve() / 'releases/Netflix-Android.apk'
    validate_apk(apk)
    adb = locate_adb(args.adb)
    result = subprocess.run([adb, 'devices', '-l'], capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=30)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or 'No se pudo iniciar Android Platform-Tools.')
    devices = parse_devices(result.stdout)
    plan = load_export_plan(args.root)
    report(f'Biblioteca publicada: {len(plan["records"])} títulos · {plan["bytes"] / 1024 ** 3:.2f} GiB.')
    if args.check:
        report('APK válida. Teléfonos USB autorizados: ' + str(len(devices)))
        for device in devices:
            report(device['model'] + ' · ' + device['serial'])
        return 0
    chosen = choose_device(devices, serial=args.serial, report=report)
    usb = AndroidUsb(adb, chosen['serial'], report)
    if usb.run('get-state') != 'device':
        raise RuntimeError('El teléfono se desconectó antes de comenzar.')
    usb.check_catalog()
    prepared = sync_plan(plan, usb.inspect, report)
    skipped = sum(item['skip'] for item in prepared['files'])
    pending = [item for item in prepared['files'] if not item['skip']]
    digest = hashlib.sha256(prepared['catalog']).hexdigest()
    catalog_unchanged = usb.inspect(CATALOG) == (len(prepared['catalog']), digest)
    usb.total = prepared['bytes'] + (0 if catalog_unchanged else len(prepared['catalog']))
    # Installer may stage more than one copy of a small APK. Reserve bounded slack.
    required = usb.total + apk.stat().st_size * 3 + 64 * 1024 ** 2
    if usb.free_bytes() < required:
        raise RuntimeError(f'No hay espacio suficiente: hacen falta {required / 1024 ** 3:.2f} GiB libres para esta actualización.')
    report(f'{skipped} archivos idénticos conservados. {len(pending)} pendientes · {prepared["bytes"] / 1024 ** 3:.2f} GiB por enviar.')
    report('Instalando/actualizando la APK; se conservan tus perfiles y el permiso de carpeta…')
    installed = usb.run('install', '--no-incremental', '-r', str(apk), timeout=300)
    if 'Success' not in installed:
        raise RuntimeError('Android no confirmó la instalación: ' + installed)
    for index, item in enumerate(pending, 1):
        report(f'[{index}/{len(pending)}] Enviando {item["relative"]}…')
        usb.transfer(item)
    if not catalog_unchanged:
        with tempfile.TemporaryDirectory(prefix='netflix-usb-catalog-') as temporary:
            source = Path(temporary) / 'catalog.json'
            source.write_bytes(prepared['catalog'])
            usb.transfer({'path': source, 'relative': CATALOG, 'size': len(prepared['catalog']), 'hash': digest}, replace_catalog=True)
    # Stop reloads cached SAF document references only after complete publication.
    usb.run('shell', 'am force-stop com.netflix.local')
    usb.run('shell', 'am start -n com.netflix.local/.MainActivity')
    report(f'LISTO: {prepared["records"]} títulos disponibles. {len(pending)} archivos enviados; {skipped} sin duplicar.')
    report('Primera conexión: pulsa Carpeta en el teléfono y elige Download/Netflix-Biblioteca. Android exige que tú concedas este permiso.')
    report('Puedes desconectar el cable y reproducir sin computadora. Para agregar títulos nuevos, publícalos en la computadora y ejecuta este archivo otra vez.')
    return 0


if __name__ == '__main__':
    # A double-clicked Windows console otherwise inherits an OEM encoding;
    # keep progress and Spanish recovery messages legible with chcp 65001.
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print('\nCancelado. Los videos originales y el catálogo publicado se conservaron; puedes repetir la conexión.', flush=True)
        raise SystemExit(130)
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
        print('Conexión detenida: ' + str(error), flush=True)
        print('No se borraron tus videos. Corrige la conexión y vuelve a ejecutar Conectar-USB.bat.', flush=True)
        raise SystemExit(1)
