"""Local static server with single byte ranges for media and uncached development files."""
import argparse
import os
from pathlib import Path
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Accept-Ranges', 'bytes')
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
