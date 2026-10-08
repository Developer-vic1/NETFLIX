"""Local desktop connection controls: fixed launchers and verified live Wi-Fi QR.

The HTTP caller must enforce loopback origin before invoking this coordinator.
USB installation/transfer confirmation stays inside the existing visible BAT.
"""
import http.client
import importlib.util
import os
from pathlib import Path
import re
import subprocess
import threading
import time
from urllib.parse import urlencode
import xml.etree.ElementTree as ET

SHARE_SCRIPT = Path(__file__).resolve().parent / 'share-library.py'
SHARE_SPEC = importlib.util.spec_from_file_location('netflix_connection_share', SHARE_SCRIPT)
SHARE = importlib.util.module_from_spec(SHARE_SPEC)
SHARE_SPEC.loader.exec_module(SHARE)
PORT = 4184
MAX_QR_PAGE = 256 * 1024


class ConnectionControl:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.lock = threading.Lock()
        self.wifi_process = None
        self.usb_process = None
        self.proof = None

    def _devices(self):
        executable = Path.home() / 'AppData/Local/Android/Sdk/platform-tools/adb.exe'
        if not executable.is_file():
            return [], ['No se encuentra ADB. El asistente USB muestra cómo prepararlo.']
        try:
            result = subprocess.run([str(executable), 'devices', '-l'], capture_output=True,
                                    text=True, encoding='utf-8', errors='replace', timeout=3,
                                    creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            if result.returncode:
                return [], ['No se pudo consultar ADB. Revisa la conexión USB.']
            devices = []
            for line in result.stdout.splitlines():
                parts = line.split()
                if len(parts) < 2 or parts[1] not in ('device', 'unauthorized', 'offline', 'recovery', 'bootloader', 'sideload'):
                    continue
                serial, state = parts[:2]
                if len(serial) > 200 or not re.fullmatch(r'[A-Za-z0-9_.:-]+', serial):
                    continue
                model = next((part[6:] for part in parts[2:] if part.startswith('model:')), '')
                if state == 'device' and ':' not in serial and len(devices) < 4:
                    try:
                        name = subprocess.run([str(executable), '-s', serial, 'shell', 'getprop', 'ro.product.marketname'], capture_output=True,
                                              text=True, encoding='utf-8', errors='replace', timeout=2,
                                              creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)).stdout.strip()
                        if name and len(name) <= 80 and '\n' not in name and '\r' not in name:
                            model = name
                    except (OSError, subprocess.TimeoutExpired):
                        pass
                devices.append({'serial': serial, 'model': model.replace('_', ' ')[:160] or serial, 'state': state})
            return devices, []
        except (OSError, subprocess.TimeoutExpired):
            return [], ['ADB no respondió. Desbloquea el teléfono y acepta la depuración USB.']

    def _apk(self):
        path = self.root / 'releases/Netflix-Android.apk'
        result = {'exists': path.is_file(), 'size': path.stat().st_size if path.is_file() else 0}
        try:
            manifest = ET.parse(self.root / 'android-local/AndroidManifest.xml').getroot()
            version = manifest.get('{http://schemas.android.com/apk/res/android}versionName')
            if version and re.fullmatch(r'[0-9]+(?:\.[0-9]+){1,3}', version):
                result['version'] = version
        except (OSError, ET.ParseError):
            pass
        return result

    def _verify_wifi(self, code):
        connection = http.client.HTTPConnection('127.0.0.1', PORT, timeout=1.5)
        try:
            connection.request('GET', '/connect?' + urlencode({'code': code}))
            response = connection.getresponse()
            body = response.read(MAX_QR_PAGE + 1)
            return (response.status == 200 and len(body) <= MAX_QR_PAGE
                    and response.getheader('Content-Type', '').startswith('text/html')
                    and b'netflixlocal://connect?' in body
                    and ('code=' + code).encode() in body)
        except (OSError, http.client.HTTPException):
            return False
        finally:
            connection.close()

    def _wifi(self):
        inactive = {'running': False, 'addresses': [], 'qrs': []}
        page = self.root / 'output/wifi-connection/conectar.html'
        try:
            stat = page.stat()
            if not page.is_file() or stat.st_size > MAX_QR_PAGE:
                return inactive
            text = page.read_text(encoding='utf-8')
            codes = set(re.findall(r'<div class="pin">([0-9]{6})</div>', text))
            if len(codes) != 1:
                return inactive
            code = next(iter(codes))
            candidates = set(re.findall(r'<code>(http://[0-9.]+:4184)</code>', text))
            current = {'http://' + address + ':4184' for address in SHARE.local_addresses()}
            addresses = sorted(candidates & current)
            if not addresses:
                return inactive
            key = (code, stat.st_mtime_ns, stat.st_size, tuple(addresses))
            now = time.monotonic()
            # Limit QR validation requests to avoid consuming pairing attempt limits.
            # Socket liveness is checked on each poll; a restarted server changes the
            # generated page key and is immediately verified with its new code.
            if not self.proof or self.proof[0] != key or now - self.proof[1] >= 20:
                self.proof = (key, now, self._verify_wifi(code))
            if not self.proof[2]:
                return inactive
            try:
                import socket
                with socket.create_connection(('127.0.0.1', PORT), timeout=.3):
                    pass
            except OSError:
                self.proof = None
                return inactive
            qrs = []
            for address in addresses:
                payload = address + '/connect?' + urlencode({'code': code})
                qrs.append({'address': address, 'payload': payload, 'svg': SHARE.qr_svg(payload)})
            return {'running': True, 'addresses': addresses, 'code': code, 'qrs': qrs}
        except (OSError, UnicodeError, ValueError):
            return inactive

    def _status(self):
        devices, messages = self._devices()
        return {'devices': devices, 'apk': self._apk(), 'wifi': self._wifi(), 'messages': messages}

    def _launch(self, filename):
        if os.name != 'nt':
            raise ValueError('Los asistentes BAT requieren Windows.')
        script = self.root / filename
        if not script.is_file() or script.is_symlink():
            raise ValueError('No se encuentra el asistente de conexión del proyecto.')
        command = subprocess.list2cmdline([str(Path(os.environ.get('SystemRoot', r'C:\Windows')) / 'System32/cmd.exe'), '/d', '/s', '/c'])
        command += ' ""' + str(script) + '""'
        return subprocess.Popen(command, cwd=str(self.root), creationflags=getattr(subprocess, 'CREATE_NEW_CONSOLE', 0x10))

    def handle(self, data):
        if not isinstance(data, dict) or set(data) != {'action'} or data.get('action') not in ('status', 'start_wifi', 'start_usb'):
            raise ValueError('La acción de conexión no es válida.')
        with self.lock:
            action = data['action']
            if action == 'status':
                return self._status()
            if action == 'start_wifi':
                status = self._status()
                if status['wifi']['running']:
                    return status
                if self.wifi_process is None or self.wifi_process.poll() is not None:
                    self.wifi_process = self._launch('Compartir-WiFi.bat')
                status['starting'] = True
                return status
            if self.usb_process is None or self.usb_process.poll() is not None:
                self.usb_process = self._launch('Conectar-USB.bat')
            status = self._status()
            status['starting'] = True
            return status
