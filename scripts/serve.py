"""Local static server with single byte ranges for media and uncached development files."""
import argparse
import json
import os
from pathlib import Path
import re
import tempfile
import uuid
from urllib.parse import unquote
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / 'assets' / 'videos' / 'library'
MP4_BRANDS = {b'isom', b'iso2', b'iso3', b'iso4', b'iso5', b'iso6', b'mp41', b'mp42', b'avc1', b'dash', b'M4V '}


class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/api/media':
            self.send_error(404)
            return
        origin = self.headers.get('Origin', '')
        allowed = f'http://127.0.0.1:{self.server.server_port}'
        if origin != allowed or self.headers.get('Content-Type', '').split(';')[0] != 'video/mp4':
            self.send_error(403, 'Solo se aceptan archivos MP4 desde la aplicación local')
            return
        original_name = unquote(self.headers.get('X-Media-Name', ''))
        if not original_name.lower().endswith('.mp4'):
            self.send_error(415, 'El nombre del archivo debe terminar en .mp4')
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            size = 0
        if size < 20 or size > 15 * 1024 ** 3:
            self.send_error(413, 'Tamaño MP4 no válido')
            return
        header = self.rfile.read(min(4096, size))
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
        MEDIA.mkdir(parents=True, exist_ok=True)
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
            filename = f'{uuid.uuid4().hex}.mp4'
            temporary.replace(MEDIA / filename)
            data = json.dumps({'url': f'assets/videos/library/{filename}', 'name': Path(original_name).name[:180], 'size': size}).encode()
            self.send_response(201)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except (OSError, ConnectionError):
            if temporary:
                temporary.unlink(missing_ok=True)
            self.send_error(500, 'No se pudo guardar el video en la carpeta local')

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
