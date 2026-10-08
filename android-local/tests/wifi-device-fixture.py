"""Isolated real-LAN fixture: deliberately cut one download to verify Android resume.

Never serves or changes the user's catalog/media. For native instrumentation only.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import threading
import sys

REPOSITORY = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY))
spec = importlib.util.spec_from_file_location('wifi_device_share', REPOSITORY / 'scripts/share-library.py')
share = importlib.util.module_from_spec(spec)
spec.loader.exec_module(share)


class InterruptedHandler(share.LibraryHandler):
    def do_GET(self):
        if self.path == '/api/test-stats':
            if not self.permitted():
                return
            if not self.server.pairing.authorized(self.client_address[0], self.headers.get('Authorization')):
                self.json_response(401, {'error': 'Pair first'})
                return
            self.json_response(200, self.server.stats)
            return
        super().do_GET()

    def send_resource(self, relative):
        if relative == 'videos/wifi-transfer.mp4':
            with self.server.stats_lock:
                resume = self.headers.get('Range')
                if resume and resume.startswith('bytes=') and not resume.startswith('bytes=0-'):
                    self.server.stats['resumedRequests'] += 1
                else:
                    self.server.stats['fullVideoRequests'] += 1
                cut = not resume and not self.server.cut
                if cut:
                    self.server.cut = True
            if cut:
                path = self.server.library.root / relative
                size = path.stat().st_size
                self.send_response(200)
                self.send_header('Content-Type', 'video/mp4')
                self.send_header('Content-Length', str(size))
                self.send_header('Connection', 'close')
                self.end_headers()
                with path.open('rb') as stream:
                    left = size // 2
                    while left:
                        chunk = stream.read(min(65536, left))
                        self.wfile.write(chunk)
                        left -= len(chunk)
                self.wfile.flush()
                self.close_connection = True
                return
        super().send_resource(relative)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=4185)
    args = parser.parse_args()
    root = REPOSITORY / 'output/android-wifi-check/fixture'
    (root / 'videos').mkdir(parents=True, exist_ok=True)
    (root / 'data/library/covers').mkdir(parents=True, exist_ok=True)
    content = (24).to_bytes(4, 'big') + b'ftypisom' + b'\0\0\0\0' + b'isommp42' + bytes(range(256)) * 16384
    (root / 'videos/wifi-transfer.mp4').write_bytes(content)
    (root / 'data/library/covers/wifi-cover.jpg').write_bytes(b'isolated-native-transfer-cover')
    record = {
        'id': 'local-00000000-0000-4000-8000-000000000001', 'kind': 'movie', 'status': 'published',
        'metadata': {'name': 'Prueba aislada de transferencia', 'description': 'Archivo utilizado solo para comprobar reanudación e integridad en un directorio de pruebas.',
                     'creator': 'Pruebas del proyecto', 'genre': 'Documental', 'year': 2026, 'ageRating': 'all', 'originalLanguage': 'es'},
        'updatedAt': '2026-10-08T12:00:00Z', 'coverUrl': 'data/library/covers/wifi-cover.jpg',
        'video': {'url': 'videos/wifi-transfer.mp4', 'name': 'wifi-transfer.mp4', 'size': len(content)},
        'media': {'duration': 1, 'width': 1280, 'height': 720},
    }
    (root / 'data/library/catalog.json').write_text(json.dumps({'version': 1, 'records': [record]}), encoding='utf-8')
    server = share.LibraryServer(('0.0.0.0', args.port), root, '678901')
    server.RequestHandlerClass = InterruptedHandler
    server.stats = {'resumedRequests': 0, 'fullVideoRequests': 0}
    server.stats_lock = threading.Lock()
    server.cut = False
    server.library.snapshot()
    print(f'Isolated Wi-Fi fixture ready on {args.port}; first media download will be interrupted.', flush=True)
    try:
        server.serve_forever(poll_interval=.1)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
