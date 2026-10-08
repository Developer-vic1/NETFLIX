"""Normalize Windows ZIP paths before signing; validate the actual packaged UI."""
import argparse
import shutil
import struct
import zipfile
from pathlib import Path


def normalize(source, destination):
    if source.resolve() == destination.resolve():
        raise ValueError('Use a separate output before signing')
    with zipfile.ZipFile(source) as original, zipfile.ZipFile(destination, 'w') as target:
        for entry in original.infolist():
            name = entry.filename.replace('\\', '/')
            if name.startswith('/') or any(part == '..' for part in name.split('/')):
                raise ValueError('Unsafe APK path')
            info = zipfile.ZipInfo(name, entry.date_time)
            info.compress_type = entry.compress_type
            info.external_attr = entry.external_attr
            with original.open(entry) as reader, target.open(info, 'w') as writer:
                shutil.copyfileobj(reader, writer, 65536)


def validate(path):
    with zipfile.ZipFile(path) as archive, path.open('rb') as raw:
        names = archive.namelist()
        required = {'AndroidManifest.xml', 'classes.dex', 'assets/www/index.html',
                    'assets/www/js/app.js', 'assets/www/css/base.css'}
        if not required.issubset(names) or len(names) != len(set(names)):
            raise ValueError('APK is missing application files or contains duplicates')
        for entry in archive.infolist():
            raw.seek(entry.header_offset)
            header = raw.read(30)
            if len(header) != 30 or header[:4] != b'PK\x03\x04':
                raise ValueError('Invalid ZIP local header')
            length = struct.unpack_from('<H', header, 26)[0]
            local = raw.read(length).decode('utf-8' if entry.flag_bits & 0x800 else 'cp437')
            if '\\' in local or local != entry.filename:
                raise ValueError('Android cannot resolve ZIP path: ' + repr(local))
            if entry.filename.lower().endswith(('.mp4', '.mkv', '.jks')):
                raise ValueError('Private media or signing key must not enter the APK')
        corrupt = archive.testzip()
        if corrupt:
            raise ValueError('Corrupt APK entry: ' + corrupt)
        print(f'Android APK: {len(names)} entries checked, local/central paths match')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('apk', type=Path)
    parser.add_argument('--normalize-to', type=Path)
    args = parser.parse_args()
    if args.normalize_to:
        normalize(args.apk, args.normalize_to)
        validate(args.normalize_to)
    else:
        validate(args.apk)
