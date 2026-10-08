"""Prepare a portable catalog and complete media files for Android folder access."""
import argparse
from copy import deepcopy
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
from urllib.parse import unquote

try:
    from library_store import LibraryStore, VIDEO_URL
    from media_import import validate_video
except ModuleNotFoundError:
    from scripts.library_store import LibraryStore, VIDEO_URL
    from scripts.media_import import validate_video

CHUNK_BYTES = 1024 * 1024
COVER_URL = re.compile(r'data/library/covers/[a-zA-Z0-9_-]+\.(?:jpg|png|webp)')


def safe_path(root, relative):
    path = root / relative
    if path.is_absolute() and not path.is_relative_to(root):
        raise ValueError('La ruta del archivo sale de la biblioteca.')
    for component in (path, *path.parents):
        if component == root.parent:
            break
        try:
            redirected = component.is_symlink() or getattr(component.stat(follow_symlinks=False), 'st_file_attributes', 0) & 0x400
        except FileNotFoundError as error:
            raise ValueError(f'No se encuentra el archivo: {relative}') from error
        if redirected:
            raise ValueError(f'No se admiten enlaces o carpetas redirigidas: {relative}')
    if not path.resolve().is_relative_to(root):
        raise ValueError('La ruta del archivo sale de la biblioteca.')
    if not path.is_file():
        raise ValueError(f'No se encuentra el archivo: {relative}')
    return path


def plan_export(root, identifiers=()):
    root = Path(root).resolve()
    store = LibraryStore(root)
    if not store.catalog.exists():
        raise ValueError('No existe data/library/catalog.json. Guarda y publica los títulos primero.')
    records = [deepcopy(record) for record in store.list() if record.get('status') == 'published']
    selected = set(identifiers)
    if selected:
        missing = selected - {record['id'] for record in records}
        if missing:
            raise ValueError('No se encuentran títulos publicados con estos identificadores: ' + ', '.join(sorted(missing)))
        records = [record for record in records if record['id'] in selected]
    if not records:
        raise ValueError('La biblioteca no tiene títulos publicados para transferir.')
    files = {}
    for record in records:
        cover = record.get('coverUrl')
        if not isinstance(cover, str) or not COVER_URL.fullmatch(cover):
            raise ValueError('La portada guardada contiene una ruta no válida.')
        cover_path = safe_path(root, cover)
        files[cover] = {'path': cover_path, 'size': cover_path.stat().st_size, 'video': False}
        if record.get('kind') == 'movie':
            descriptors = [record.get('video')]
        elif record.get('kind') == 'series' and isinstance(record.get('episodes'), list) and record['episodes']:
            descriptors = [episode.get('video') for episode in record['episodes']]
        else:
            raise ValueError('El título no tiene una película o capítulos válidos.')
        for descriptor in descriptors:
            if not isinstance(descriptor, dict) or not isinstance(descriptor.get('url'), str):
                raise ValueError('El video guardado contiene una ruta no válida.')
            relative = unquote(descriptor['url'])
            if not VIDEO_URL.fullmatch(relative):
                raise ValueError('El video guardado contiene una ruta no válida.')
            path = safe_path(root, relative)
            try:
                size = validate_video(path)
            except ValueError as error:
                raise ValueError(f'El video no tiene un archivo MP4/MKV válido: {relative} ({error})') from error
            if type(descriptor.get('size')) is not int or descriptor['size'] != size:
                raise ValueError(f'El video cambió de tamaño desde que fue guardado: {relative}')
            files[relative] = {'path': path, 'size': size, 'video': True}
    return {'root': root, 'records': records, 'files': files, 'bytes': sum(item['size'] for item in files.values())}


def copy_complete(source, destination, expected):
    """Copy in bounded blocks; never load an entire film into Python memory."""
    before = source.stat()
    written = 0
    with source.open('rb') as reader, destination.open('xb') as writer:
        while block := reader.read(CHUNK_BYTES):
            writer.write(block)
            written += len(block)
            if written > expected:
                raise ValueError(f'El archivo cambió durante la transferencia: {source.name}')
        writer.flush()
        os.fsync(writer.fileno())
    after = source.stat()
    if written != expected or destination.stat().st_size != expected or (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise ValueError(f'El archivo cambió durante la transferencia: {source.name}')


def export_library(plan, output, copy=False, report=print):
    output = Path(output).absolute()
    root = plan['root']
    # Only a new destination is accepted, so retries cannot overwrite another
    # package or mix an older catalog with newly exported media.
    if output.exists():
        raise ValueError('La carpeta de destino ya existe. Elige una carpeta nueva.')
    if output == root or root.is_relative_to(output):
        raise ValueError('El destino no puede contener la biblioteca original.')
    for folder in ('videos', 'series', 'assets/videos', 'data/library'):
        if output.is_relative_to(root / folder):
            raise ValueError('El destino no puede estar dentro de las carpetas originales de videos o catálogo.')
    output.parent.mkdir(parents=True, exist_ok=True)
    resolved = output.parent.resolve() / output.name
    if resolved != output:
        raise ValueError('La carpeta de destino no puede atravesar enlaces o carpetas redirigidas.')
    free = shutil.disk_usage(output.parent).free
    required = sum(item['size'] for item in plan['files'].values() if copy or not item['video'] or item['path'].stat().st_dev != output.parent.stat().st_dev)
    if free < required + 1024 * 1024:
        raise ValueError(f'No hay espacio suficiente. Se requieren al menos {required} bytes disponibles.')
    staging = Path(tempfile.mkdtemp(prefix=output.name + '.preparando-', dir=output.parent))
    linked, copied = 0, 0
    try:
        for index, (relative, item) in enumerate(plan['files'].items(), start=1):
            destination = staging / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            method = 'copia'
            if item['video'] and not copy:
                try:
                    os.link(item['path'], destination)
                    linked += 1
                    method = 'enlace local, sin duplicar el video'
                except OSError:
                    if shutil.disk_usage(staging).free < item['size'] + 1024 * 1024:
                        raise ValueError('Este disco no permite enlaces locales y no tiene espacio suficiente para copiar el video.')
                    copy_complete(item['path'], destination, item['size'])
                    copied += 1
            else:
                copy_complete(item['path'], destination, item['size'])
                copied += 1
            if destination.stat().st_size != item['size']:
                raise ValueError(f'La transferencia quedó incompleta: {relative}')
            report(f'[{index}/{len(plan["files"])}] {relative} · {method}')
        catalog = staging / 'data' / 'library' / 'catalog.json'
        catalog.parent.mkdir(parents=True, exist_ok=True)
        catalog.write_text(json.dumps({'version': 1, 'records': plan['records']}, ensure_ascii=False, allow_nan=False, indent=2), encoding='utf-8')
        # Publish the package only after every selected resource is complete.
        if output.exists():
            raise ValueError('La carpeta de destino fue creada por otro proceso. No se sobrescribió.')
        staging.rename(output)
    finally:
        if staging.exists():
            # Validate the final absolute target before any recursive removal.
            # This path is exclusively the temporary package created above.
            if staging.resolve().parent != output.parent.resolve() or not staging.name.startswith(output.name + '.preparando-') or staging.is_symlink():
                raise ValueError('No se pudo verificar la carpeta temporal; no se eliminó.')
            shutil.rmtree(staging)
    return {'output': output, 'linked': linked, 'copied': copied, 'bytes': plan['bytes']}


def main(argv=None):
    parser = argparse.ArgumentParser(description='Prepara la biblioteca para transferirla a Android sin recortar ni alterar los videos originales.')
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent, help='Carpeta del proyecto de origen.')
    parser.add_argument('--output', type=Path, help='Carpeta nueva del paquete que copiarás al celular.')
    parser.add_argument('--title-id', action='append', default=[], help='Identificador de un título publicado. Se puede repetir.')
    parser.add_argument('--copy', action='store_true', help='Crear copias independientes; por defecto se intentan enlaces locales sin duplicar videos.')
    parser.add_argument('--list', action='store_true', help='Revisar títulos y espacio necesario, sin crear archivos.')
    args = parser.parse_args(argv)
    if not args.list and args.output is None:
        parser.error('indica --output con una carpeta nueva o usa --list para consultar primero')
    try:
        plan = plan_export(args.root, args.title_id)
        for record in plan['records']:
            count = len(record.get('episodes', [])) if record['kind'] == 'series' else 1
            print(f'{record["id"]} · {record["metadata"]["name"]} · {count} video(s)')
        print(f'Transferencia al celular: {plan["bytes"] / 1024 ** 3:.2f} GiB ({plan["bytes"]} bytes), más el catálogo.')
        if not args.list:
            result = export_library(plan, args.output, args.copy)
            print(f'Biblioteca lista: {result["output"]}')
            print(f'{result["linked"]} enlaces locales y {result["copied"]} archivos copiados. Los originales se conservaron.')
        return 0
    except (ValueError, OSError) as error:
        print(f'No se preparó la biblioteca: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
