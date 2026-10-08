"""Open the desktop app using only Python's standard library."""
import hashlib
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parent.parent
URL = 'http://127.0.0.1:4173'


def available():
    try:
        with urllib.request.urlopen(URL + '/index.html', timeout=2) as response:
            content = response.read(128 * 1024)
        return hashlib.sha256(content).digest() == hashlib.sha256((ROOT / 'index.html').read_bytes()).digest()
    except (OSError, urllib.error.URLError):
        return False


def main():
    if available():
        webbrowser.open(URL + '/#/home', new=2)
        print('Netflix ya estaba abierto. Se conservó el servidor existente.', flush=True)
        return 0
    with socket.socket() as probe:
        if probe.connect_ex(('127.0.0.1', 4173)) == 0:
            print('El puerto 4173 pertenece a otra página. Cierra ese servidor o revisa la guía antes de abrir Netflix.', flush=True)
            return 1
    process = subprocess.Popen([sys.executable, '-u', str(ROOT / 'scripts/serve.py')], cwd=ROOT)
    try:
        for _ in range(30):
            if process.poll() is not None:
                return process.returncode or 1
            if available():
                webbrowser.open(URL + '/#/home', new=2)
                print('Netflix listo. En el menú encontrarás Conexiones. Mantén esta ventana abierta mientras lo uses.', flush=True)
                return process.wait()
            time.sleep(.2)
        print('El servidor no terminó de iniciar. Revisa los mensajes de esta ventana.', flush=True)
        return 1
    except KeyboardInterrupt:
        return 0
    finally:
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=10)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    raise SystemExit(main())
