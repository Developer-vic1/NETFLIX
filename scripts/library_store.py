"""Durable local catalog metadata, with atomic writes and validated media references."""
import base64
import binascii
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import re
import tempfile
import threading
from urllib.parse import quote, unquote
import uuid

try:
    from media_import import validate_video
except ModuleNotFoundError:
    from scripts.media_import import validate_video

MAX_COVER = 12 * 1024 ** 2
MAX_REQUEST = 18 * 1024 ** 2
MAX_CATALOG = 64 * 1024 ** 2
UUID = r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
RECORD_ID = re.compile(rf'local-(?:series-)?{UUID}')
EPISODE_ID = re.compile(rf'episode-{UUID}')
VIDEO_URL = re.compile(r'(?:videos|series|assets/videos/library)/[a-zA-Z0-9_#.-]+\.(?:mp4|mkv)')
COVER_TYPES = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'}


def _integer(value, minimum, maximum):
    return type(value) is int and minimum <= value <= maximum


def _text(value, minimum, maximum):
    if not isinstance(value, str) or not minimum <= len(value.strip()) <= maximum:
        raise ValueError('library.invalid')
    return value.strip()


class LibraryStore:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.directory = self.root / 'data' / 'library'
        self.catalog = self.directory / 'catalog.json'
        self._lock = threading.RLock()

    def _safe_path(self, relative):
        path = self.root / relative
        # Do not follow a symlink to another folder, even one whose resolved
        # destination happens to stay beneath the root today.
        for candidate in (path, *path.parents):
            if candidate == self.root.parent:
                break
            if candidate.is_symlink():
                raise ValueError('library.permissionDenied')
        try:
            path.resolve().relative_to(self.root)
        except ValueError as error:
            raise ValueError('library.invalid') from error
        return path

    def _read(self):
        self._safe_path('data/library/catalog.json')
        if not self.catalog.exists():
            return []
        if not self.catalog.is_file() or self.catalog.stat().st_size > MAX_CATALOG:
            raise ValueError('library.catalogError')
        try:
            data = json.loads(self.catalog.read_text(encoding='utf-8'))
        except (UnicodeError, json.JSONDecodeError) as error:
            raise ValueError('library.catalogError') from error
        if not isinstance(data, dict) or data.get('version') != 1 or not isinstance(data.get('records'), list):
            raise ValueError('library.catalogError')
        records = data['records']
        identifiers = [record.get('id') for record in records if isinstance(record, dict)]
        if len(identifiers) != len(records) or any(not isinstance(value, str) or not RECORD_ID.fullmatch(value) for value in identifiers) or len(set(identifiers)) != len(identifiers):
            raise ValueError('library.catalogError')
        return records

    def list(self):
        with self._lock:
            # Reading saved metadata does not synthesize records from files or
            # discard entries whose video has since become unavailable.
            return json.loads(json.dumps(self._read()))

    def _metadata(self, value):
        if not isinstance(value, dict):
            raise ValueError('library.invalid')
        result = {key: _text(value.get(key), minimum, maximum) for key, minimum, maximum in (
            ('name', 1, 100), ('description', 20, 2000), ('creator', 1, 160), ('genre', 1, 60))}
        if not _integer(value.get('year'), 1888, datetime.now().year + 5) or value.get('ageRating') not in ('all', '7+', '13+', '16+', '18+') or value.get('originalLanguage') not in ('es', 'en', 'it', 'ar', 'other'):
            raise ValueError('library.invalid')
        result.update({key: value[key] for key in ('year', 'ageRating', 'originalLanguage')})
        return result

    def _media(self, value):
        if not isinstance(value, dict):
            raise ValueError('library.invalid')
        duration = value.get('duration')
        if type(duration) not in (int, float) or not math.isfinite(duration) or not 0 < duration <= 366 * 24 * 3600 or not _integer(value.get('width'), 1, 32768) or not _integer(value.get('height'), 1, 32768):
            raise ValueError('library.invalid')
        return {key: value[key] for key in ('duration', 'width', 'height')}

    def _video(self, value):
        if not isinstance(value, dict) or not isinstance(value.get('url'), str):
            raise ValueError('library.invalid')
        relative = unquote(value['url'])
        if not VIDEO_URL.fullmatch(relative) or '..' in Path(relative).parts:
            raise ValueError('library.invalid')
        path = self._safe_path(relative)
        size = validate_video(path)
        if type(value.get('size')) is not int or value['size'] != size:
            raise ValueError('library.sourceChanged')
        return {'url': quote(relative, safe='/'), 'name': _text(value.get('name'), 1, 180), 'size': size}

    def _record(self, record):
        if not isinstance(record, dict) or not isinstance(record.get('id'), str) or not RECORD_ID.fullmatch(record['id']):
            raise ValueError('library.invalid')
        if record.get('kind') not in ('movie', 'series') or record.get('status') not in ('draft', 'published'):
            raise ValueError('library.invalid')
        result = {'id': record['id'], 'kind': record['kind'], 'metadata': self._metadata(record.get('metadata')), 'status': record['status'], 'updatedAt': datetime.now(timezone.utc).isoformat()}
        if record['kind'] == 'movie':
            result.update(video=self._video(record.get('video')), media=self._media(record.get('media')))
        else:
            episodes = record.get('episodes')
            if not isinstance(episodes, list) or not 1 <= len(episodes) <= 1000:
                raise ValueError('library.invalid')
            slots, ids, checked = set(), set(), []
            for episode in episodes:
                if not isinstance(episode, dict) or not isinstance(episode.get('id'), str) or not EPISODE_ID.fullmatch(episode['id']) or not _integer(episode.get('season'), 1, 99) or not _integer(episode.get('number'), 1, 999):
                    raise ValueError('library.invalid')
                slot = (episode['season'], episode['number'])
                if slot in slots or episode['id'] in ids:
                    raise ValueError('library.duplicateEpisode')
                ids.add(episode['id'])
                slots.add(slot)
                checked.append({'id': episode['id'], 'name': _text(episode.get('name'), 1, 120), 'description': _text(episode.get('description', ''), 0, 1000), 'season': episode['season'], 'number': episode['number'], 'video': self._video(episode.get('video')), 'media': self._media(episode.get('media'))})
            result['episodes'] = sorted(checked, key=lambda item: (item['season'], item['number']))
        return result

    def _cover_bytes(self, cover):
        if not isinstance(cover, dict) or not isinstance(cover.get('type'), str) or cover['type'] not in COVER_TYPES or not isinstance(cover.get('data'), str) or len(cover['data']) > 4 * ((MAX_COVER + 2) // 3):
            raise ValueError('library.coverError')
        try:
            data = base64.b64decode(cover['data'], validate=True)
        except (binascii.Error, ValueError) as error:
            raise ValueError('library.coverError') from error
        valid = (
            cover['type'] == 'image/jpeg' and data.startswith(b'\xff\xd8\xff') and data.endswith(b'\xff\xd9') or
            cover['type'] == 'image/png' and data.startswith(b'\x89PNG\r\n\x1a\n') and data[12:16] == b'IHDR' or
            cover['type'] == 'image/webp' and data[:4] == b'RIFF' and data[8:12] == b'WEBP' and len(data) >= 20 and int.from_bytes(data[4:8], 'little') + 8 == len(data)
        )
        if not data or len(data) > MAX_COVER or not valid:
            raise ValueError('library.coverError')
        return data

    def _atomic(self, destination, data):
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=destination.parent, suffix='.part', delete=False) as stream:
                temporary = Path(stream.name)
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, destination)
        finally:
            if temporary:
                temporary.unlink(missing_ok=True)

    def save(self, record, cover=None):
        with self._lock:
            checked = self._record(record)
            records = self._read()
            previous = next((item for item in records if item['id'] == checked['id']), None)
            if previous and previous.get('kind') != checked['kind']:
                raise ValueError('library.invalid')
            if not previous and len(records) >= 1000:
                raise ValueError('library.catalogError')
            cover_data = self._cover_bytes(cover) if cover is not None else None
            if cover_data is None:
                if not previous or not isinstance(previous.get('coverUrl'), str) or not re.fullmatch(r'data/library/covers/[a-zA-Z0-9_-]+\.(?:jpg|png|webp)', previous['coverUrl']):
                    raise ValueError('library.coverError')
                cover_path = self._safe_path(previous['coverUrl'])
                if not cover_path.is_file():
                    raise ValueError('library.coverError')
                checked['coverUrl'] = previous['coverUrl']
            else:
                checked['coverUrl'] = f"data/library/covers/{checked['id']}-{uuid.uuid4().hex}.{COVER_TYPES[cover['type']]}"
                cover_path = self._safe_path(checked['coverUrl'])
            updated = [item for item in records if item['id'] != checked['id']] + [checked]
            serialized = json.dumps({'version': 1, 'records': updated}, ensure_ascii=False, allow_nan=False, indent=2).encode('utf-8')
            if len(serialized) > MAX_CATALOG:
                raise ValueError('library.catalogError')
            self._safe_path('data/library/catalog.json')
            self.directory.mkdir(parents=True, exist_ok=True)
            new_cover_written = False
            try:
                if cover_data is not None:
                    cover_path.parent.mkdir(parents=True, exist_ok=True)
                    self._atomic(cover_path, cover_data)
                    new_cover_written = True
                self._atomic(self.catalog, serialized)
            except Exception:
                if new_cover_written:
                    cover_path.unlink(missing_ok=True)
                raise
            return json.loads(json.dumps(checked))
