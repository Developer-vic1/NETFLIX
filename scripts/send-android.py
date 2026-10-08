"""Transfer the prepared APK and library to one explicitly selected Android device."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import time

ROOT = Path(__file__).resolve().parent.parent
DESTINATION = '/sdcard/Download/Netflix-Biblioteca'
STAGING = DESTINATION + '-cargando'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--serial', required=True, help='Identificador del teléfono confirmado por su propietario.')
    parser.add_argument('--adb', type=Path, default=Path(os.environ.get('LOCALAPPDATA', '')) / 'Android/Sdk/platform-tools/adb.exe')
    args = parser.parse_args()
    prefix = [str(args.adb), '-s', args.serial]

    def run(*values, check=True):
        result = subprocess.run(prefix + list(values), capture_output=True, text=True, encoding='utf-8', errors='replace')
        if check and result.returncode:
            raise RuntimeError(result.stderr.strip() or result.stdout.strip() or 'Se interrumpió la conexión con el teléfono.')
        return result.stdout.strip()

    def shell(command, check=True):
        return run('shell', command, check=check)

    if run('get-state') != 'device':
        raise RuntimeError('El teléfono no está autorizado o disponible.')
    print('Teléfono: ' + shell('getprop ro.product.model'), flush=True)
    # Destination is fixed inside Download. Existing folders are never replaced.
    for remote in (DESTINATION, STAGING):
        if shell('if [ -e ' + shlex.quote(remote) + ' ]; then echo EXISTS; fi') == 'EXISTS':
            raise RuntimeError('Ya existe ' + remote + '. Se conservó; revisa esa carpeta antes de otra transferencia.')
    library = ROOT / 'output/android/Netflix-Biblioteca'
    catalog = library / 'data/library/catalog.json'
    records = json.loads(catalog.read_text(encoding='utf-8'))['records']
    files = sorted((file for file in library.rglob('*') if file.is_file()), key=lambda file: (file == catalog, file.as_posix()))
    total = sum(file.stat().st_size for file in files)
    space = shell('df -k /sdcard').splitlines()[-1].split()
    if int(space[3]) * 1024 < total + 64 * 1024 ** 2:
        raise RuntimeError('No hay espacio suficiente para la biblioteca en el teléfono.')
    apk = ROOT / 'releases/Netflix-Android.apk'
    apk_remote = '/sdcard/Download/Netflix-Android.apk'
    run('push', '-Z', str(apk), apk_remote)
    local_hash = hashlib.sha256(apk.read_bytes()).hexdigest()
    if shell('sha256sum ' + shlex.quote(apk_remote)).split()[0] != local_hash:
        raise RuntimeError('La APK transferida no coincide con el archivo de origen.')
    print('APK enviada y SHA-256 verificado: Download/Netflix-Android.apk', flush=True)
    shell('mkdir -p ' + shlex.quote(STAGING))
    completed = 0
    started = time.monotonic()
    for index, file in enumerate(files, 1):
        relative = file.relative_to(library).as_posix()
        if '..' in Path(relative).parts or any(char in relative for char in '\\\r\n\0'):
            raise RuntimeError('Nombre de archivo no válido en la biblioteca preparada.')
        remote = STAGING + '/' + relative
        shell('mkdir -p ' + shlex.quote(remote.rsplit('/', 1)[0]))
        expected = file.stat().st_size
        print(f'[{index}/{len(files)}] Enviando {relative} ({expected / 1024 ** 2:.1f} MiB)', flush=True)
        process = subprocess.Popen(prefix + ['push', '-Z', str(file), remote], stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                   text=True, encoding='utf-8', errors='replace')
        try:
            while True:
                try:
                    output, _ = process.communicate(timeout=20)
                    if process.returncode:
                        raise RuntimeError(output.strip() or 'Se interrumpió la transferencia.')
                    break
                except subprocess.TimeoutExpired:
                    size = shell('stat -c %s ' + shlex.quote(remote), check=False)
                    received = min(expected, int(size)) if size.isdigit() else 0
                    percent = (completed + received) * 100 / total
                    print(f'Progreso real: {percent:.1f}% · {(completed + received) / 1024 ** 3:.2f} / {total / 1024 ** 3:.2f} GiB', flush=True)
        except BaseException:
            process.terminate()
            process.wait(timeout=10)
            raise
        actual = shell('stat -c %s ' + shlex.quote(remote))
        if actual != str(expected):
            raise RuntimeError('Archivo incompleto: ' + relative)
        completed += expected
        print(f'Confirmado: {completed * 100 / total:.1f}%', flush=True)
    # Confirm both absolute Android paths stay in the explicitly named Download folder.
    if not STAGING.startswith('/sdcard/Download/') or not DESTINATION.startswith('/sdcard/Download/'):
        raise RuntimeError('Destino de publicación no válido.')
    shell('test ! -e ' + shlex.quote(DESTINATION) + ' && mv ' + shlex.quote(STAGING) + ' ' + shlex.quote(DESTINATION))
    if shell('stat -c %s ' + shlex.quote(DESTINATION + '/data/library/catalog.json')) != str(catalog.stat().st_size):
        raise RuntimeError('No se pudo confirmar el catálogo final.')
    print(f'TRANSFERENCIA COMPLETA: {len(records)} títulos, {len(files)} archivos, {total / 1024 ** 3:.2f} GiB; {(time.monotonic() - started) / 60:.1f} minutos.', flush=True)
    print('Abre el APK en Archivos, instala la app y elige Download/Netflix-Biblioteca con el botón Carpeta.', flush=True)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError) as error:
        print('Transferencia detenida: ' + str(error), flush=True)
        print('Los originales del equipo se conservan. Una carpeta con -cargando todavía no está lista.', flush=True)
        raise SystemExit(1)
