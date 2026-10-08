"""Persistent catalog contracts, using temporary media and atomic failure cases."""
import base64
from copy import deepcopy
import http.client
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.parse import unquote
import uuid
from functools import partial
from http.server import ThreadingHTTPServer

from scripts.library_store import LibraryStore

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==')


class LibraryStoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.store = LibraryStore(self.root)
        self.content = (24).to_bytes(4, 'big') + b'ftypisom' + b'\0\0\0\0' + b'isommp42' + b'complete-video'
        self.video = self.root / 'videos' / 'movie.mp4'
        self.video.parent.mkdir()
        self.video.write_bytes(self.content)
        self.cover = {'type': 'image/png', 'data': base64.b64encode(PNG).decode()}
        self.record = {
            'id': 'local-' + str(uuid.uuid4()), 'kind': 'movie',
            'metadata': {'name': 'A real movie', 'description': 'A sufficiently detailed description.', 'creator': 'Creator', 'genre': 'Drama', 'year': 2026, 'ageRating': 'all', 'originalLanguage': 'es'},
            'video': {'url': 'videos/movie.mp4', 'name': 'movie.mp4', 'size': len(self.content)},
            'media': {'duration': 123.4, 'width': 1920, 'height': 1080}, 'status': 'published',
            'updatedAt': '2000-01-01T00:00:00Z', 'coverBlob': 'must-not-persist', 'sourcePath': 'C:/private/original.mp4',
        }

    def test_empty_store_does_not_scan_media_or_create_catalog(self):
        self.assertEqual(self.store.list(), [])
        self.assertFalse(self.store.catalog.exists())

    def test_movie_and_cover_survive_new_store_instance(self):
        saved = self.store.save(self.record, self.cover)
        self.assertEqual(LibraryStore(self.root).list(), [saved])
        self.assertEqual((self.root / saved['coverUrl']).read_bytes(), PNG)
        self.assertNotIn('sourcePath', saved)
        self.assertNotIn('coverBlob', saved)
        self.assertNotEqual(saved['updatedAt'], self.record['updatedAt'])
        self.assertEqual(self.video.read_bytes(), self.content)

    def test_valid_matroska_reference_persists_without_renaming_to_mp4(self):
        video = self.video.with_suffix('.mkv')
        content = bytes.fromhex('1a45dfa38b4282886d6174726f736b6118538067ff')
        video.write_bytes(content)
        record = deepcopy(self.record)
        record['video'] = {'url': 'videos/movie.mkv', 'name': 'movie.mkv', 'size': len(content)}
        saved = self.store.save(record, self.cover)
        self.assertEqual(LibraryStore(self.root).list(), [saved])
        self.assertEqual(saved['video']['url'], 'videos/movie.mkv')
        self.assertEqual(video.read_bytes(), content)

    def test_update_without_cover_reuses_previous_cover(self):
        previous = self.store.save(self.record, self.cover)
        updated = deepcopy(self.record)
        updated['status'] = 'draft'
        saved = self.store.save(updated)
        self.assertEqual(saved['coverUrl'], previous['coverUrl'])
        self.assertEqual(saved['status'], 'draft')
        self.assertEqual(len(self.store.list()), 1)

    def test_atomic_failure_preserves_catalog_and_previous_cover(self):
        previous = self.store.save(self.record, self.cover)
        original_catalog = self.store.catalog.read_bytes()
        original_cover = (self.root / previous['coverUrl']).read_bytes()
        original_atomic = self.store._atomic
        def fail_catalog(destination, data):
            if destination == self.store.catalog:
                raise OSError('Disk unavailable')
            return original_atomic(destination, data)
        with patch.object(self.store, '_atomic', side_effect=fail_catalog):
            with self.assertRaises(OSError):
                self.store.save(self.record, self.cover)
        self.assertEqual(self.store.catalog.read_bytes(), original_catalog)
        self.assertEqual((self.root / previous['coverUrl']).read_bytes(), original_cover)
        self.assertEqual(len(list((self.store.directory / 'covers').iterdir())), 1)
        self.assertFalse(list(self.store.directory.rglob('*.part')))

    def test_file_replace_failure_preserves_previous_catalog(self):
        self.store.save(self.record, self.cover)
        previous = self.store.catalog.read_bytes()
        with patch('scripts.library_store.os.replace', side_effect=PermissionError('locked')):
            with self.assertRaises(PermissionError):
                self.store.save(self.record)
        self.assertEqual(previous, self.store.catalog.read_bytes())
        self.assertFalse(list(self.store.directory.glob('*.part')))

    def test_series_sorted_by_season_number_and_hash_url_preserved(self):
        record = deepcopy(self.record)
        record.update(id='local-series-' + str(uuid.uuid4()), kind='series')
        record.pop('video'); record.pop('media')
        folder = self.root / 'series'; folder.mkdir()
        (folder / 'series_#1.mp4').write_bytes(self.content)
        episodes = []
        for number in (2, 1):
            episodes.append({'id': 'episode-' + str(uuid.uuid4()), 'name': f'Episode {number}', 'description': '', 'season': 1, 'number': number, 'video': {'url': 'series/series_%231.mp4', 'name': 'series_#1.mp4', 'size': len(self.content)}, 'media': deepcopy(self.record['media'])})
        record['episodes'] = episodes
        saved = self.store.save(record, self.cover)
        self.assertEqual([item['number'] for item in saved['episodes']], [1, 2])
        self.assertEqual(saved['episodes'][0]['video']['url'], 'series/series_%231.mp4')

    def test_duplicate_episode_position_is_rejected(self):
        record = deepcopy(self.record)
        record.update(kind='series', episodes=[{'id': 'episode-' + str(uuid.uuid4()), 'name': 'Episode', 'description': '', 'season': 1, 'number': 1, 'video': record['video'], 'media': record['media']}])
        duplicate = deepcopy(record['episodes'][0]); duplicate['id'] = 'episode-' + str(uuid.uuid4())
        record['episodes'].append(duplicate)
        with self.assertRaisesRegex(ValueError, 'library.duplicateEpisode'):
            self.store.save(record, self.cover)
        self.assertFalse(self.store.catalog.exists())

    def test_bad_metadata_duration_id_and_size_rejected(self):
        for mutate in (
            lambda item: item.update(id='../outside'),
            lambda item: item['metadata'].update(description='short'),
            lambda item: item['metadata'].update(year=True),
            lambda item: item['media'].update(duration=float('nan')),
            lambda item: item['media'].update(width=0),
            lambda item: item['video'].update(size=1),
        ):
            record = deepcopy(self.record); mutate(record)
            with self.assertRaises(ValueError):
                self.store.save(record, self.cover)
        self.assertFalse(self.store.catalog.exists())

    def test_media_reference_outside_allowlist_is_rejected(self):
        for url in ('../outside.mp4', 'videos/../outside.mp4', 'http://remote/movie.mp4', '/videos/movie.mp4', 'assets/videos/movie.mp4', 'videos/%2E%2E/outside.mp4'):
            record = deepcopy(self.record); record['video']['url'] = url
            with self.assertRaises(ValueError):
                self.store.save(record, self.cover)
        self.assertTrue(self.video.exists())

    def test_cover_invalid_type_base64_or_signature_rejected(self):
        for cover in ({'type': 'image/svg+xml', 'data': self.cover['data']}, {'type': ['image/png'], 'data': ''}, {'type': 'image/png', 'data': 'not base64'}, {'type': 'image/png', 'data': base64.b64encode(b'fake-image').decode()}):
            with self.assertRaisesRegex(ValueError, 'library.coverError'):
                self.store.save(self.record, cover)
        self.assertFalse(self.store.catalog.exists())

    def test_new_record_requires_cover(self):
        with self.assertRaisesRegex(ValueError, 'library.coverError'):
            self.store.save(self.record)

    def test_corrupt_catalog_is_reported_and_not_overwritten(self):
        self.store.directory.mkdir(parents=True)
        self.store.catalog.write_text('broken-json', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'library.catalogError'):
            self.store.list()
        with self.assertRaisesRegex(ValueError, 'library.catalogError'):
            self.store.save(self.record, self.cover)
        self.assertEqual(self.store.catalog.read_text(), 'broken-json')

    def test_list_preserves_saved_entry_when_video_goes_missing(self):
        saved = self.store.save(self.record, self.cover)
        self.video.unlink()
        self.assertEqual(self.store.list(), [saved])
        with self.assertRaisesRegex(ValueError, 'library.sourceUnavailable'):
            self.store.save(self.record)


class LibraryApiTests(unittest.TestCase):
    def setUp(self):
        LibraryStoreTests.setUp(self)
        spec = importlib.util.spec_from_file_location('library_api_server', Path(__file__).resolve().parents[1] / 'scripts' / 'serve.py')
        self.server_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.server_module)
        self.server_module.LIBRARY = self.store
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), partial(self.server_module.Handler, directory=str(self.root)))
        self.worker = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.worker.start()
        self.addCleanup(self.close_server)

    def close_server(self):
        self.server.shutdown(); self.server.server_close(); self.worker.join()

    def request(self, method, body=None, origin=True, path='/api/library'):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
        headers = {'Content-Type': 'application/json'}
        if origin:
            headers['Origin'] = f'http://127.0.0.1:{self.server.server_port}'
        connection.request(method, path, json.dumps(body) if body is not None else None, headers)
        response = connection.getresponse()
        payload = response.read(); status = response.status
        connection.close()
        return status, json.loads(payload)

    def test_api_post_get_and_origin_guard(self):
        self.assertEqual(self.request('GET'), (200, {'records': []}))
        self.assertEqual(self.request('POST', {'record': self.record, 'cover': self.cover}, origin=False)[0], 403)
        status, saved = self.request('POST', {'record': self.record, 'cover': self.cover})
        self.assertEqual(status, 200)
        self.assertEqual(self.request('GET'), (200, {'records': [saved]}))
        self.assertEqual(self.request('POST', {'record': self.record})[1]['coverUrl'], saved['coverUrl'])

    def test_api_invalid_record_and_body_preserve_catalog(self):
        saved = self.store.save(self.record, self.cover)
        self.assertEqual(self.request('POST', [self.record])[0], 400)
        invalid = deepcopy(self.record); invalid['video']['size'] = 1
        self.assertEqual(self.request('POST', {'record': invalid})[0], 400)
        self.assertEqual(self.store.list(), [saved])


if __name__ == '__main__':
    unittest.main()
