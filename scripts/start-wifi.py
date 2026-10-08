"""Start the private library server after verifying its narrow Windows firewall rule."""
import argparse
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=4184)
    parser.add_argument('--skip-firewall', action='store_true', help='Para un firewall ya configurado manualmente o pruebas.')
    args, remaining = parser.parse_known_args()
    if not 1024 <= args.port <= 65535:
        parser.error('Usa un puerto entre 1024 y 65535.')
    if os.name == 'nt' and not args.skip_firewall:
        result = subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
                                 str(ROOT / 'scripts/allow-local-wifi.ps1'), '-PythonPath', sys.executable, '-Port', str(args.port)])
        if result.returncode:
            return result.returncode
    return subprocess.call([sys.executable, '-u', str(ROOT / 'scripts/share-library.py'), '--port', str(args.port), *remaining], cwd=ROOT)


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    raise SystemExit(main())
