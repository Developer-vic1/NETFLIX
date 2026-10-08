"""Share only published library resources with a paired phone on a private LAN.

No cloud service, upload, filesystem write or firewall modification is performed.
The Android client persists verified downloads separately for offline playback.
"""
import argparse
from collections import OrderedDict
from copy import deepcopy
import hashlib
import html
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import socket
import sys
import threading
import time
from urllib.parse import parse_qs, quote, unquote, urlencode, urlsplit
import webbrowser

try:
    from library_store import LibraryStore, VIDEO_URL, MAX_COVER
    from media_import import validate_video
except ModuleNotFoundError:
    from scripts.library_store import LibraryStore, VIDEO_URL, MAX_COVER
    from scripts.media_import import validate_video

BLOCK = 1024 * 1024
MAX_BODY = 4096
TOKEN_SECONDS = 2 * 3600
COVER_URL = re.compile(r'data/library/covers/[a-zA-Z0-9_-]+\.(?:jpg|png|webp)')
NETWORKS = tuple(ipaddress.ip_network(value) for value in ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8'))


def private_address(value):
    try:
        address = ipaddress.ip_address(value)
        return address.version == 4 and any(address in network for network in NETWORKS)
    except ValueError:
        return False


def safe_file(root, relative):
    """Reject links/junctions even when their current destination is inside root."""
    if not isinstance(relative, str) or '\\' in relative or '\x00' in relative:
        raise ValueError('La ruta del archivo no es válida.')
    path = root / relative
    if Path(relative).is_absolute() or any(part in ('..', '.') for part in relative.split('/')):
        raise ValueError('La ruta del archivo no es válida.')
    for candidate in (path, *path.parents):
        if candidate == root.parent:
            break
        attributes = candidate.stat(follow_symlinks=False)
        if candidate.is_symlink() or getattr(attributes, 'st_file_attributes', 0) & 0x400:
            raise ValueError('No se permiten enlaces o carpetas redirigidas.')
    if not path.resolve().is_relative_to(root) or not path.is_file():
        raise ValueError('No se encuentra el archivo de la biblioteca.')
    return path


def identity(stat):
    # Windows path stat reports creation time while fstat may report change time;
    # ctime is deliberately excluded so both describe the same open file.
    return stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns


def byte_range(header, size):
    if header is None:
        return 0, size - 1, False
    matched = re.fullmatch(r'bytes=(\d*)-(\d*)', header)
    if not matched or not any(matched.groups()) or size <= 0:
        raise ValueError('Rango de bytes no válido.')
    first, last = matched.groups()
    if first:
        start = int(first)
        end = min(int(last), size - 1) if last else size - 1
    else:
        suffix = int(last)
        if suffix == 0:
            raise ValueError('Rango de bytes no válido.')
        start, end = max(0, size - suffix), size - 1
    if start >= size or start > end:
        raise ValueError('Rango de bytes fuera del archivo.')
    return start, end, True


class SharedLibrary:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.store = LibraryStore(self.root)
        self.hashes = OrderedDict()
        self.hash_lock = threading.Lock()

    def snapshot(self, identifiers=None):
        safe_file(self.root, 'data/library/catalog.json')
        records = [deepcopy(value) for value in self.store.list() if value.get('status') == 'published']
        if identifiers is not None:
            missing = set(identifiers) - {value['id'] for value in records}
            if missing:
                raise LookupError('El título ya no está publicado. Actualiza la biblioteca.')
            records = [value for value in records if value['id'] in identifiers]
        files = {}
        for record in records:
            # Existing catalog validation checks all required movie/episode metadata.
            # Preserve its saved timestamps and identifiers in the returned record.
            self.store._record(record)
            cover = record.get('coverUrl')
            if not isinstance(cover, str) or not COVER_URL.fullmatch(cover):
                raise ValueError('La portada guardada no es válida.')
            path = safe_file(self.root, cover)
            if not 0 < path.stat().st_size <= MAX_COVER:
                raise ValueError('La portada guardada no es válida.')
            files[cover] = {'path': path, 'mime': {'jpg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp'}[path.suffix[1:]]}
            videos = [record['video']] if record['kind'] == 'movie' else [episode['video'] for episode in record['episodes']]
            for descriptor in videos:
                relative = unquote(descriptor['url'])
                if not VIDEO_URL.fullmatch(relative) or quote(relative, safe='/') != descriptor['url']:
                    raise ValueError('La ruta del video no es válida.')
                path = safe_file(self.root, relative)
                if validate_video(path) != descriptor['size']:
                    raise ValueError('El video cambió desde que se publicó. Guarda sus datos de nuevo.')
                files[relative] = {'path': path, 'mime': 'video/mp4' if path.suffix.lower() == '.mp4' else 'video/x-matroska'}
        return records, files

    def fingerprint(self, path):
        # One reader at a time avoids competing full-film reads from the same disk.
        with self.hash_lock:
            before = identity(path.stat())
            key = (str(path), before)
            if key in self.hashes:
                self.hashes.move_to_end(key)
                return before[2], self.hashes[key]
            digest = hashlib.sha256()
            with path.open('rb') as source:
                if identity(os.fstat(source.fileno())) != before:
                    raise ValueError('El archivo cambió. Vuelve a intentarlo.')
                for block in iter(lambda: source.read(BLOCK), b''):
                    digest.update(block)
            if identity(path.stat()) != before:
                raise ValueError('El archivo cambió durante la preparación. Vuelve a intentarlo.')
            result = digest.hexdigest()
            self.hashes[key] = result
            while len(self.hashes) > 4096:
                self.hashes.popitem(last=False)
            return before[2], result

    def manifest(self, identifiers=None):
        records, resources = self.snapshot(identifiers)
        files = []
        for relative, resource in resources.items():
            size, digest = self.fingerprint(resource['path'])
            files.append({'path': relative, 'size': size, 'sha256': digest, 'mime': resource['mime']})
        # Publication can change during a long hash pass. Never return a mixed revision.
        current, _ = self.snapshot(identifiers)
        if current != records:
            raise ValueError('La biblioteca cambió durante la preparación. Actualízala y reintenta.')
        return {'version': 1, 'records': records, 'files': files}


class Pairing:
    def __init__(self, code=None, clock=time.monotonic):
        self.code = code or f'{secrets.randbelow(1000000):06d}'
        self.clock = clock
        self.tokens = {}
        self.attempts = {}
        self.lock = threading.Lock()

    def _check(self, address, code):
        now = self.clock()
        self.attempts = {ip: times for ip, times in self.attempts.items() if times and times[-1] > now - 60}
        times = [stamp for stamp in self.attempts.get(address, []) if stamp > now - 60]
        if len(times) >= 6 or sum(len(value) for value in self.attempts.values()) >= 30:
            raise OverflowError('Demasiados intentos. Espera un minuto antes de volver a conectar.')
        self.attempts[address] = times + [now]
        if not isinstance(code, str) or not re.fullmatch(r'[0-9]{6}', code) or not secrets.compare_digest(code, self.code):
            raise PermissionError('El código no coincide. Revisa el código que muestra la computadora.')
        return now

    def verify_code(self, address, code):
        """Opening the QR landing page checks the code but never grants a token."""
        with self.lock:
            self._check(address, code)

    def pair(self, address, code):
        with self.lock:
            now = self._check(address, code)
            self.tokens = {key: value for key, value in self.tokens.items() if value[1] > now}
            if len(self.tokens) >= 64:
                raise OverflowError('Hay demasiadas conexiones activas. Reinicia el servidor para cambiar el código.')
            token = secrets.token_urlsafe(32)
            self.tokens[token] = (address, now + TOKEN_SECONDS)
            return {'token': token, 'expiresIn': TOKEN_SECONDS}

    def authorized(self, address, authorization):
        if not isinstance(authorization, str) or not authorization.startswith('Bearer '):
            return False
        with self.lock:
            value = self.tokens.get(authorization[7:])
            return bool(value and value[0] == address and value[1] > self.clock())


class LibraryServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 16

    def __init__(self, address, root, code=None):
        self.library = SharedLibrary(root)
        self.pairing = Pairing(code)
        self.workers = threading.BoundedSemaphore(8)
        super().__init__(address, LibraryHandler)

    def process_request(self, request, client_address):
        if not self.workers.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.workers.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.workers.release()


class LibraryHandler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    server_version = 'NetflixLocalShare/1'

    def setup(self):
        super().setup()
        self.connection.settimeout(300)

    def log_message(self, pattern, *args):
        # Do not print tokens, pairing bodies or title names in connection logs.
        pass

    def json_response(self, status, payload, extra=None):
        body = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Connection', 'close')
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.close_connection = True
        if self.command != 'HEAD':
            self.wfile.write(body)

    def permitted(self):
        if not private_address(self.client_address[0]) or self.headers.get('Origin') is not None:
            self.json_response(403, {'error': 'Solo se permite una conexión directa desde tu red privada.'})
            return False
        try:
            host = urlsplit('http://' + self.headers.get('Host', ''))
            if not private_address(host.hostname) or host.port != self.server.server_port or host.path or host.query or host.fragment or host.username or host.password:
                raise ValueError()
        except (ValueError, TypeError):
            self.json_response(403, {'error': 'La dirección del servidor no es válida.'})
            return False
        return True

    def do_POST(self):
        if not self.permitted():
            return
        if self.path != '/api/pair':
            self.json_response(405, {'error': 'El servidor solo permite leer y descargar títulos publicados.'})
            return
        try:
            length = int(self.headers.get('Content-Length', '-1'))
            if self.headers.get('Transfer-Encoding') or not 0 < length <= MAX_BODY:
                raise ValueError('La solicitud de conexión no es válida.')
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict) or set(payload) != {'code'}:
                raise ValueError('Escribe el código de seis dígitos de la computadora.')
            result = self.server.pairing.pair(self.client_address[0], payload['code'])
            self.json_response(200, result)
        except OverflowError as error:
            self.json_response(429, {'error': str(error)}, {'Retry-After': '60'})
        except PermissionError as error:
            self.json_response(403, {'error': str(error)})
        except (ValueError, UnicodeError) as error:
            self.json_response(400, {'error': str(error)})

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        if not self.permitted():
            return
        route = urlsplit(self.path)
        if route.path == '/connect':
            self.send_connection_page(route)
            return
        if not self.server.pairing.authorized(self.client_address[0], self.headers.get('Authorization')):
            self.json_response(401, {'error': 'Conecta con el código de la computadora para consultar la biblioteca.'})
            return
        try:
            if route.path == '/api/status' and not route.query:
                # A heartbeat checks only the authenticated connection. Large
                # catalogs or currently importing files must not delay it.
                self.json_response(200, {'status': 'connected'})
            elif route.path == '/api/catalog' and not route.query:
                records, _ = self.server.library.snapshot()
                self.json_response(200, {'version': 1, 'records': records})
            elif route.path == '/api/manifest':
                query = parse_qs(route.query, keep_blank_values=True, max_num_fields=1)
                if set(query) - {'ids'} or len(query.get('ids', [])) > 1:
                    raise ValueError('La selección de títulos no es válida.')
                identifiers = None
                if 'ids' in query:
                    raw = query['ids'][0]
                    if len(raw) > 60000 or not raw:
                        raise ValueError('Selecciona al menos un título.')
                    identifiers = set(raw.split(','))
                    if len(identifiers) > 1000:
                        raise ValueError('Hay demasiados títulos seleccionados.')
                self.json_response(200, self.server.library.manifest(identifiers))
            elif route.path.startswith('/api/files/') and not route.query:
                self.send_resource(unquote(route.path[len('/api/files/'):]))
            else:
                self.json_response(404, {'error': 'La dirección solicitada no está disponible.'})
        except LookupError as error:
            self.json_response(404, {'error': str(error)})
        except (ValueError, FileNotFoundError, PermissionError) as error:
            self.json_response(409, {'error': str(error)})
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            self.close_connection = True
        except OSError:
            self.json_response(503, {'error': 'No se pudo leer la biblioteca. Revisa el archivo y vuelve a intentar.'})

    def send_connection_page(self, route):
        try:
            query = parse_qs(route.query, keep_blank_values=True, max_num_fields=1)
            if set(query) != {'code'} or len(query['code']) != 1:
                raise ValueError('Este enlace no contiene un código válido. Escanea el QR de la computadora.')
            code = query['code'][0]
            self.server.pairing.verify_code(self.client_address[0], code)
            address = 'http://' + self.headers['Host']
            body = connection_landing(address, code).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.send_header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'")
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Connection', 'close')
            self.end_headers()
            self.close_connection = True
            if self.command != 'HEAD':
                self.wfile.write(body)
        except OverflowError as error:
            self.json_response(429, {'error': str(error)}, {'Retry-After': '60'})
        except PermissionError as error:
            self.json_response(403, {'error': str(error)})
        except ValueError as error:
            self.json_response(400, {'error': str(error)})

    def send_resource(self, relative):
        _, resources = self.server.library.snapshot()
        resource = resources.get(relative)
        if resource is None:
            self.json_response(404, {'error': 'El archivo no pertenece a un título publicado.'})
            return
        path = safe_file(self.server.library.root, relative)
        with path.open('rb') as source:
            size = os.fstat(source.fileno()).st_size
            if identity(os.fstat(source.fileno())) != identity(path.stat()):
                raise ValueError('El archivo cambió. Actualiza la biblioteca.')
            try:
                start, end, partial = byte_range(self.headers.get('Range'), size)
            except ValueError:
                self.json_response(416, {'error': 'El rango solicitado no está disponible.'}, {'Content-Range': f'bytes */{size}'})
                return
            self.send_response(206 if partial else 200)
            self.send_header('Content-Type', resource['mime'])
            self.send_header('Content-Length', str(end - start + 1))
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Connection', 'close')
            if partial:
                self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
            self.end_headers()
            self.close_connection = True
            if self.command == 'HEAD':
                return
            source.seek(start)
            remaining = end - start + 1
            while remaining:
                block = source.read(min(BLOCK, remaining))
                if not block:
                    self.close_connection = True
                    return
                self.wfile.write(block)
                remaining -= len(block)

    def do_DELETE(self):
        self.json_response(405, {'error': 'Este servidor no permite modificar o eliminar la biblioteca.'})

    do_PUT = do_DELETE
    do_PATCH = do_DELETE


def local_addresses():
    values = set()
    try:
        values.update(item[4][0] for item in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET))
    except OSError:
        pass
    for target in ('192.168.1.1', '10.0.0.1'):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as connection:
                connection.connect((target, 9))
                values.add(connection.getsockname()[0])
        except OSError:
            pass
    return sorted(value for value in values if private_address(value) and not value.startswith('127.'))


PAGE_STYLE = '''*{box-sizing:border-box}body{margin:0;background:#101014;color:#f5f5f5;font:16px/1.6 system-ui,-apple-system,sans-serif}main{max-width:1050px;margin:0 auto;padding:40px 24px}.brand{color:#e50914;font-size:26px;letter-spacing:2px;font-weight:900}h1{font-size:clamp(28px,5vw,42px);line-height:1.2;margin:22px 0 12px}p{color:#babac3}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:24px;margin:30px 0}.card{border:1px solid #35353c;border-radius:20px;background:#1b1b21;padding:24px;text-align:center}.qr{max-width:300px;margin:0 auto 18px;background:white;border:12px solid white;border-radius:12px}.qr svg{display:block;width:100%;height:auto}code{display:block;overflow-wrap:anywhere;font-family:ui-monospace,monospace;font-size:15px;color:#fff}.pin{font-size:32px;letter-spacing:7px;font-weight:800;color:white;margin:12px 0}.button{display:block;background:#e50914;color:white;text-decoration:none;border-radius:10px;padding:15px 18px;font-weight:750;margin:24px 0 14px}.secondary{color:#fff;display:inline-block;padding:8px 0}.hint{font-size:14px}.steps{margin:24px 0;padding-left:22px}.steps li{margin:10px 0}.mobile{max-width:540px}.mobile .card{text-align:left;margin:26px 0}.status{display:inline-block;border:1px solid #36734b;color:#83dfa2;border-radius:30px;padding:5px 12px;font-size:13px}.warning{border-left:3px solid #e50914;padding:0 15px}'''


def connection_landing(address, code):
    params = urlencode({'address': address, 'code': code}, quote_via=quote)
    intent = 'intent://connect?' + params + '#Intent;scheme=netflixlocal;package=com.netflix.local;end'
    fallback = 'netflixlocal://connect?' + params
    return f'''<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conectar Netflix Local</title><style>{PAGE_STYLE}</style></head><body><main class="mobile"><div class="brand">NETFLIX LOCAL</div><h1>Tu biblioteca, en tu teléfono.</h1><p>La computadora y tu teléfono están en la misma red. Abre la aplicación para elegir qué guardar y verlo después sin conexión.</p><section class="card"><span class="status">Enlace de conexión verificado</span><p>Computadora</p><code>{html.escape(address)}</code><a class="button" href="{html.escape(intent, quote=True)}">Abrir Netflix Local y conectar</a><a class="secondary" href="{html.escape(fallback, quote=True)}">Abrir con enlace directo</a></section><p class="hint">Si Android pregunta, permite abrir Netflix Local. Debes tener instalada la aplicación actualizada. La descarga empieza cuando selecciones los títulos dentro de la aplicación.</p><p class="hint warning">Mantén abierta la ventana de la computadora durante la transferencia. Al terminar, puedes ver lo guardado sin Wi-Fi ni computadora.</p></main></body></html>'''


def qr_svg(payload):
    # Vendored MIT implementation: no pip dependency, network image or remote QR service.
    import importlib.util
    vendor = Path(__file__).resolve().parent.parent / 'vendor' / 'python' / 'qrcodegen.py'
    spec = importlib.util.spec_from_file_location('netflix_qrcodegen', vendor)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    qr = module.QrCode.encode_text(payload, module.QrCode.Ecc.MEDIUM)
    border = 4
    size = qr.get_size() + border * 2
    commands = [f'M{x + border},{y + border}h1v1h-1z' for y in range(qr.get_size()) for x in range(qr.get_size()) if qr.get_module(x, y)]
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" role="img" aria-label="Código QR para conectar Netflix Local" shape-rendering="crispEdges"><rect width="{size}" height="{size}" fill="#fff"/><path d="{" ".join(commands)}" fill="#000"/></svg>'


def write_connection_qr(root, addresses, port, code):
    if not re.fullmatch(r'[0-9]{6}', code) or not 1 <= port <= 65535:
        raise ValueError('Los datos de conexión no son válidos.')
    cards = []
    for address in addresses:
        if not private_address(address):
            raise ValueError('La dirección para el QR debe pertenecer a tu red privada.')
        origin = f'http://{address}:{port}'
        payload = origin + '/connect?' + urlencode({'code': code})
        cards.append(f'<section class="card"><div class="qr">{qr_svg(payload)}</div><code>{html.escape(origin)}</code><div class="pin">{code}</div><p class="hint">Escanea con la cámara del teléfono conectado a esta Wi-Fi.</p></section>')
    empty = '<p class="warning">No se encontró una dirección privada. Conecta la computadora a tu Wi-Fi y vuelve a iniciar Compartir-WiFi.bat.</p>'
    document = f'''<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'"><title>Netflix Local · Conectar teléfono</title><style>{PAGE_STYLE}</style></head><body><main><div class="brand">NETFLIX LOCAL</div><h1>Conecta tu teléfono por Wi-Fi.</h1><p>Escanea el QR de la misma red que usa tu teléfono. El código se genera en esta computadora y cambia al reiniciar el servidor.</p><div class="grid">{''.join(cards) if cards else empty}</div><ol class="steps"><li>Conecta la computadora y el teléfono a la misma Wi-Fi.</li><li>Escanea el QR con la cámara y pulsa «Abrir Netflix Local y conectar».</li><li>Selecciona los títulos para guardarlos completos y verlos después sin conexión.</li></ol><p class="hint warning">Mantén esta ventana y el servidor abiertos al descargar. No necesitas Internet ni hotspot. No compartas el QR: permite conectar a tu biblioteca mientras el servidor está abierto.</p><p class="hint">Si no aparece el enlace, en la aplicación pulsa Wi-Fi e introduce la dirección y el código que ves arriba. Si Windows pide permiso, permite Python en redes privadas.</p></main></body></html>'''
    directory = Path(root).resolve() / 'output' / 'wifi-connection'
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / 'conectar.html'
    destination.write_text(document, encoding='utf-8')
    return destination


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    parser = argparse.ArgumentParser(description='Comparte la biblioteca con Android en la misma Wi-Fi, sin Internet.')
    parser.add_argument('--port', type=int, default=4184)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--no-browser', action='store_true', help='Genera el QR sin abrir el navegador de la computadora.')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('El puerto debe estar entre 1 y 65535.')
    server = None
    try:
        server = LibraryServer(('0.0.0.0', args.port), args.root)
        records, _ = server.library.snapshot()
        print('\nNETFLIX LOCAL · TRANSFERENCIA POR WI-FI', flush=True)
        print(f'Biblioteca: {len(records)} títulos publicados. Se vuelve a leer al actualizar desde Android.', flush=True)
        addresses = local_addresses()
        for address in addresses:
            print(f'Dirección para escribir en el teléfono: http://{address}:{args.port}', flush=True)
        if not addresses:
            print('No se detectó una IPv4 privada. Conecta la computadora a tu Wi-Fi y reinicia.', flush=True)
        print(f'CÓDIGO DE CONEXIÓN: {server.pairing.code}', flush=True)
        try:
            qr_page = write_connection_qr(args.root, addresses, args.port, server.pairing.code)
            print(f'QR generado en esta computadora: {qr_page}', flush=True)
            if not args.no_browser:
                webbrowser.open(qr_page.as_uri(), new=2)
        except (OSError, ImportError, ValueError) as error:
            print(f'No se pudo abrir el QR: {error}. Puedes conectar con la dirección y el código.', flush=True)
        print('En Android abre Wi-Fi, escribe la dirección y el código, y elige los títulos a guardar.', flush=True)
        print('Usa la misma red. No necesitas hotspot ni Internet; sí mantener esta ventana abierta al descargar.', flush=True)
        print('Si Windows pregunta, permite Python únicamente en redes privadas. No abras puertos del router.', flush=True)
        print('Los videos permanecen en la computadora y se guardan completos en el teléfono para verlos sin conexión.', flush=True)
        print('Cierra con Ctrl+C. Al reiniciar cambia el código y se cierran las conexiones autorizadas.\n', flush=True)
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        print('\nServidor cerrado.', flush=True)
    except (OSError, ValueError) as error:
        print(f'No se pudo compartir: {error}', flush=True)
        return 1
    finally:
        if server:
            server.server_close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
