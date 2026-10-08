"""Local static server with single byte ranges for media and uncached development files."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import uuid
from urllib.parse import unquote, urlsplit
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
try:
    from connection_control import ConnectionControl
except ModuleNotFoundError:
    from scripts.connection_control import ConnectionControl
try:
    from media_import import MediaImports, validate_mkv_header
    from library_store import LibraryStore, MAX_REQUEST
except ModuleNotFoundError:
    from scripts.media_import import MediaImports, validate_mkv_header
    from scripts.library_store import LibraryStore, MAX_REQUEST

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / 'assets' / 'videos' / 'library'
MP4_BRANDS = {b'isom', b'iso2', b'iso3', b'iso4', b'iso5', b'iso6', b'mp41', b'mp42', b'avc1', b'dash', b'M4V '}
IMPORTS = MediaImports(ROOT)
LIBRARY = LibraryStore(ROOT)
CONNECTIONS = ConnectionControl(ROOT)


class Handler(SimpleHTTPRequestHandler):
    def local_request(self):
        if self.headers.get('Origin', '') != f'http://127.0.0.1:{self.server.server_port}':
            self.json_response({'error': 'library.permissionDenied'}, 403)
            return False
        return True

    def json_response(self, data, status=200):
        content = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        try:
            self.wfile.write(content)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass

    def do_GET(self):
        if urlsplit(self.path).path == '/api/library':
            try:
                self.json_response({'records': LIBRARY.list()})
            except Exception as error:
                key = str(error) if str(error).startswith('library.') else 'library.catalogError'
                self.json_response({'error': key}, 500)
            return
        identifier = re.fullmatch(r'/api/imports/([a-f0-9]{32})', urlsplit(self.path).path)
        if identifier:
            snapshot = IMPORTS.get(identifier.group(1))
            self.json_response(snapshot or {'error': 'library.sourceUnavailable'}, 200 if snapshot else 404)
            return
        super().do_GET()

    def do_DELETE(self):
        if not self.local_request():
            return
        identifier = re.fullmatch(r'/api/imports/([a-f0-9]{32})', self.path)
        snapshot = IMPORTS.cancel(identifier.group(1)) if identifier else None
        self.json_response(snapshot or {'error': 'library.sourceUnavailable'}, 200 if snapshot else 404)

    def translate_path(self, path):
        source = re.fullmatch(r'/api/media/source/([a-f0-9]{32})', urlsplit(path).path)
        if source:
            original = IMPORTS.source(source.group(1))
            return str(original) if original else str(ROOT / '__missing_media_source__')
        return super().translate_path(path)

    def do_POST(self):
        if self.path == '/api/connections':
            if not self.local_request():
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 4096 or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                    raise ValueError('connection.invalid')
                content = self.rfile.read(length)
                if len(content) != length:
                    raise ValueError('connection.invalid')
                self.json_response(CONNECTIONS.handle(json.loads(content)))
            except (ValueError, UnicodeError) as error:
                self.json_response({'error': str(error)}, 400)
            except OSError:
                self.json_response({'error': 'No se pudo abrir el asistente de conexión. Usa los archivos BAT de la carpeta Netflix.'}, 503)
            return
        if self.path == '/api/library':
            if not self.local_request():
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= MAX_REQUEST or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                    raise ValueError('library.invalid')
                payload = self.rfile.read(length)
                if len(payload) != length:
                    raise ValueError('library.invalid')
                data = json.loads(payload)
                if not isinstance(data, dict):
                    raise ValueError('library.invalid')
                self.json_response(LIBRARY.save(data.get('record'), data.get('cover')))
            except ValueError as error:
                key = str(error) if str(error).startswith('library.') else 'library.invalid'
                self.json_response({'error': key}, 400)
            except PermissionError:
                self.json_response({'error': 'library.permissionDenied'}, 500)
            except OSError as error:
                self.json_response({'error': 'library.spaceError' if error.errno == 28 else 'library.catalogError'}, 500)
            return
        if self.path in ('/api/media/pick', '/api/media/source', '/api/imports'):
            if not self.local_request():
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 16384 or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
                    raise ValueError('library.invalid')
                data = json.loads(self.rfile.read(length))
                if not isinstance(data, dict):
                    raise ValueError('library.invalid')
                if self.path.endswith('/pick'):
                    result = IMPORTS.pick()
                elif self.path == '/api/media/source':
                    source_path = data.get('path')
                    if isinstance(data.get('url'), str):
                        relative = unquote(data['url'])
                        if not re.fullmatch(r'(?:videos|series|assets/videos(?:/library)?)/[a-zA-Z0-9_#.-]+\.(?:mp4|mkv)', relative):
                            raise ValueError('library.sourceUnavailable')
                        candidate = (ROOT / relative).resolve()
                        candidate.relative_to(ROOT)
                        source_path = str(candidate)
                    result = IMPORTS.register(source_path)
                else:
                    result = IMPORTS.start(data)
                self.json_response(result or {'cancelled': True})
            except ValueError as error:
                key = str(error) if str(error).startswith('library.') else 'library.invalid'
                self.json_response({'error': key}, 400)
            except Exception:
                self.json_response({'error': 'library.sourceError'}, 500)
            return
        if self.path != '/api/media':
            self.send_error(404)
            return
        origin = self.headers.get('Origin', '')
        allowed = f'http://127.0.0.1:{self.server.server_port}'
        if origin != allowed or self.headers.get('Content-Type', '').split(';')[0] not in ('video/mp4', 'video/x-matroska'):
            self.send_error(403, 'Solo se aceptan archivos MP4 o MKV desde la aplicación local')
            return
        original_name = unquote(self.headers.get('X-Media-Name', ''))
        if Path(original_name).suffix.lower() not in ('.mp4', '.mkv'):
            self.send_error(415, 'El nombre del archivo debe terminar en .mp4 o .mkv')
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            size = 0
        if size < 20 or size > 15 * 1024 ** 3:
            self.send_error(413, 'Tamaño MP4 no válido')
            return
        upload_id = self.headers.get('X-Upload-Id', uuid.uuid4().hex)
        if not re.fullmatch(r'[a-f0-9]{32}', upload_id):
            self.send_error(400, 'Identificador de carga no válido')
            return
        MEDIA.mkdir(parents=True, exist_ok=True)
        extension = Path(original_name).suffix.lower()
        final_path = MEDIA / f'{upload_id}{extension}'
        if final_path.exists():
            self.send_error(409, 'El archivo ya está guardado; comprueba la referencia antes de reintentar')
            return
        if shutil.disk_usage(MEDIA).free < size + 16 * 1024 ** 2:
            self.send_error(507, 'No hay espacio suficiente en disco para guardar el video completo')
            return
        header = self.rfile.read(min(4096, size))
        if extension == '.mkv':
            try:
                validate_mkv_header(header)
            except ValueError:
                self.send_error(415, 'Contenedor MKV no válido')
                return
        else:
            if len(header) < 20 or header[4:8] != b'ftyp':
                self.send_error(415, 'El archivo no contiene una cabecera MP4')
                return
            box = int.from_bytes(header[:4], 'big')
            offset = 16 if box == 1 else 8
            if box == 1:
                box = int.from_bytes(header[8:16], 'big')
            if box < offset + 8 or box > len(header) or (box - offset - 8) % 4 or header[offset:offset + 4] == b'qt  ':
                self.send_error(415, 'Contenedor MP4 no válido')
                return
            brands = [header[offset:offset + 4]] + [header[i:i + 4] for i in range(offset + 8, box, 4)]
            if not any(brand in MP4_BRANDS for brand in brands):
                self.send_error(415, 'Contenedor MP4 no compatible')
                return
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=MEDIA, suffix='.part', delete=False) as output:
                temporary = Path(output.name)
                output.write(header)
                remaining = size - len(header)
                while remaining:
                    chunk = self.rfile.read(min(1024 * 1024, remaining))
                    if not chunk:
                        raise ConnectionError('Carga interrumpida')
                    output.write(chunk)
                    remaining -= len(chunk)
            filename = final_path.name
            temporary.rename(final_path)
            data = json.dumps({'url': f'assets/videos/library/{filename}', 'name': Path(original_name).name[:180], 'size': size}).encode()
            self.send_response(201)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except (OSError, ConnectionError):
            if temporary:
                temporary.unlink(missing_ok=True)
            try:
                self.send_error(500, 'No se pudo guardar el video en la carpeta local')
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass  # A cancelled browser upload has already closed its socket.

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('X-Netflix-Local', '1')
        super().end_headers()

    def send_head(self):
        self.byte_range = None
        path = self.translate_path(self.path)
        requested = self.headers.get('Range')
        if not requested or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', requested.strip())
        if not match or not any(match.groups()) or size == 0:
            return self.reject_range(size)
        first, last = match.groups()
        if first:
            start = int(first)
            end = min(int(last), size - 1) if last else size - 1
        else:
            start, end = max(0, size - int(last)), size - 1
        if start > end or start >= size:
            return self.reject_range(size)
        stream = open(path, 'rb')
        stream.seek(start)
        self.byte_range = (start, end)
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.end_headers()
        return stream

    def reject_range(self, size):
        self.send_response(416)
        self.send_header('Content-Range', f'bytes */{size}')
        self.send_header('Content-Length', '0')
        self.end_headers()
        return None

    def copyfile(self, source, output):
        try:
            if self.byte_range is None:
                return super().copyfile(source, output)
            remaining = self.byte_range[1] - self.byte_range[0] + 1
            while remaining:
                data = source.read(min(64 * 1024, remaining))
                if not data:
                    break
                output.write(data)
                remaining -= len(data)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # A navigation, pause or quality switch can cancel a media request.


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=4173)
    args = parser.parse_args()
    os.chdir(Path(__file__).resolve().parent.parent)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'Local server: http://127.0.0.1:{args.port}/#/home', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
