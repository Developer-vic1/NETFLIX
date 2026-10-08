"""Portable Android catalog export preserves metadata, sources and full files."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import quote
import uuid

SCRIPT = Path(__file__).resolve().parent.parent / 'scripts' / 'export-mobile-library.py'
SPEC = importlib.util.spec_from_file_location('mobile_export', SCRIPT)
EXPORT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXPORT)


class MobileExportTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.root = self.base / 'source'
        self.root.mkdir()
        self.content = (24).to_bytes(4, 'big') + b'ftypisom' + b'\0\0\0\0' + b'isommp42' + b'complete-video'
        self.catalog = self.root / 'data/library/catalog.json'
        self.catalog.parent.mkdir(parents=True)
        self.cover = 'data/library/covers/cover.png'
        (self.root / self.cover).parent.mkdir()
        (self.root / self.cover).write_bytes(b'cover')
        self.movie = {
            'id': 'local-' + str(uuid.uuid4()), 'kind': 'movie', 'status': 'published',
            'metadata': {'name': 'Movie'}, 'coverUrl': self.cover,
            'video': self.video('videos/movie.mp4'), 'media': {'duration': 99, 'width': 1280, 'height': 720},
            'updatedAt': '2026-10-08T12:00:00Z',
        }
        self.series = deepcopy(self.movie)
        self.series.update(id='local-series-' + str(uuid.uuid4()), kind='series', metadata={'name': 'La isla de las tentaciones'})
        self.series.pop('video')
        self.series.pop('media')
        self.series['episodes'] = [
            {'id': 'episode-' + str(uuid.uuid4()), 'number': number, 'season': 11, 'name': f'Episodio {number}', 'description': '', 'video': self.video(f'series/isla_T11_#{number}.mp4'), 'media': {'duration': 7000, 'width': 1280, 'height': 720}}
            for number in (1, 3)
        ]
        self.write_catalog([self.movie, self.series])

    def video(self, relative):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(self.content)
        return {'url': quote(relative, safe='/'), 'name': path.name, 'size': len(self.content)}

    def write_catalog(self, records):
        self.catalog.write_text(json.dumps({'version': 1, 'records': records}), encoding='utf-8')

    def export(self, copy=False, identifiers=()):
        destination = self.base / 'Netflix'
        plan = EXPORT.plan_export(self.root, identifiers)
        result = EXPORT.export_library(plan, destination, copy=copy, report=lambda _: None)
        return destination, result

    def test_complete_catalog_and_encoded_episode_names_are_preserved(self):
        destination, result = self.export(copy=True)
        copied = json.loads((destination / 'data/library/catalog.json').read_text(encoding='utf-8'))
        self.assertEqual(copied, {'version': 1, 'records': [self.movie, self.series]})
        self.assertEqual((destination / 'series/isla_T11_#1.mp4').read_bytes(), self.content)
        self.assertEqual((destination / 'series/isla_T11_#3.mp4').read_bytes(), self.content)
        self.assertFalse((destination / 'series/isla_T11_#2.mp4').exists())
        self.assertEqual(result['linked'], 0)
        self.assertEqual(result['copied'], 4)

    def test_local_hardlinks_do_not_duplicate_video_storage(self):
        destination, result = self.export()
        self.assertEqual(result['linked'], 3)
        self.assertTrue((destination / 'videos/movie.mp4').samefile(self.root / 'videos/movie.mp4'))
        self.assertFalse((destination / self.cover).samefile(self.root / self.cover))
        self.assertEqual((self.root / 'videos/movie.mp4').read_bytes(), self.content)

    def test_hardlink_failure_falls_back_to_bounded_copy(self):
        with patch.object(EXPORT.os, 'link', side_effect=OSError('Not supported')):
            destination, result = self.export()
        self.assertEqual(result['linked'], 0)
        self.assertEqual(result['copied'], 4)
        self.assertEqual((destination / 'videos/movie.mp4').read_bytes(), self.content)

    def test_drafts_and_unreferenced_sources_are_not_exported(self):
        draft = deepcopy(self.movie)
        draft.update(id='local-' + str(uuid.uuid4()), status='draft', video=self.video('videos/draft.mp4'))
        self.video('videos/not-in-catalog.mp4')
        self.write_catalog([self.movie, self.series, draft])
        destination, _ = self.export(copy=True)
        self.assertFalse((destination / 'videos/draft.mp4').exists())
        self.assertFalse((destination / 'videos/not-in-catalog.mp4').exists())

    def test_selection_only_exports_requested_published_series(self):
        destination, result = self.export(copy=True, identifiers=[self.series['id']])
        self.assertEqual(result['copied'], 3)
        self.assertFalse((destination / 'videos/movie.mp4').exists())
        self.assertEqual(json.loads((destination / 'data/library/catalog.json').read_text())['records'], [self.series])

    def test_unknown_or_unpublished_selection_is_not_silently_ignored(self):
        with self.assertRaisesRegex(ValueError, 'identificadores'):
            EXPORT.plan_export(self.root, ['local-' + str(uuid.uuid4())])

    def test_changed_video_size_fails_before_destination_is_created(self):
        (self.root / 'videos/movie.mp4').write_bytes(self.content + b'changed')
        with self.assertRaisesRegex(ValueError, 'tamaño'):
            self.export(copy=True)
        self.assertFalse((self.base / 'Netflix').exists())

    def test_video_and_cover_traversal_rejected(self):
        for location in ('video', 'cover'):
            record = deepcopy(self.movie)
            if location == 'video':
                record['video']['url'] = 'videos/%2E%2E/outside.mp4'
            else:
                record['coverUrl'] = '../outside.png'
            self.write_catalog([record])
            with self.assertRaisesRegex(ValueError, 'ruta'):
                EXPORT.plan_export(self.root)

    def test_missing_resource_has_an_actionable_message(self):
        (self.root / self.cover).unlink()
        with self.assertRaisesRegex(ValueError, 'No se encuentra el archivo'):
            EXPORT.plan_export(self.root)

    def test_invalid_video_header_is_not_transferred(self):
        path = self.root / 'videos/movie.mp4'
        path.write_bytes(b'invalid-file-with-mp4-extension')
        with self.assertRaisesRegex(ValueError, 'MP4/MKV'):
            EXPORT.plan_export(self.root)

    def test_empty_or_missing_catalog_does_not_export_loose_files(self):
        self.write_catalog([])
        with self.assertRaisesRegex(ValueError, 'títulos publicados'):
            EXPORT.plan_export(self.root)
        self.catalog.unlink()
        with self.assertRaisesRegex(ValueError, 'Guarda y publica'):
            EXPORT.plan_export(self.root)

    def test_symbolic_link_video_is_rejected(self):
        original = self.root / 'videos/movie.mp4'
        original.unlink()
        outside = self.base / 'outside.mp4'
        outside.write_bytes(self.content)
        try:
            original.symlink_to(outside)
        except OSError:
            self.skipTest('Windows does not permit symbolic links in this session.')
        with self.assertRaisesRegex(ValueError, 'enlaces'):
            EXPORT.plan_export(self.root)

    def test_existing_destination_is_never_overwritten(self):
        output = self.base / 'Netflix'
        output.mkdir()
        marker = output / 'keep.txt'
        marker.write_text('Keep')
        with self.assertRaisesRegex(ValueError, 'ya existe'):
            EXPORT.export_library(EXPORT.plan_export(self.root), output)
        self.assertEqual(marker.read_text(), 'Keep')

    def test_source_nested_destination_is_rejected(self):
        for output in (self.root, self.base, self.root / 'videos/package', self.root / 'data/library/package'):
            with self.assertRaises(ValueError):
                EXPORT.export_library(EXPORT.plan_export(self.root), output)

    def test_copy_failure_leaves_no_partial_package_and_preserves_originals(self):
        catalog_before = self.catalog.read_bytes()
        with patch.object(EXPORT, 'copy_complete', side_effect=OSError('Disk disconnected')):
            with self.assertRaisesRegex(OSError, 'disconnected'):
                self.export(copy=True)
        self.assertFalse((self.base / 'Netflix').exists())
        self.assertFalse(list(self.base.glob('Netflix.preparando-*')))
        self.assertEqual(self.catalog.read_bytes(), catalog_before)
        self.assertEqual((self.root / 'videos/movie.mp4').read_bytes(), self.content)

    def test_insufficient_space_fails_without_partial_files(self):
        with patch.object(EXPORT.shutil, 'disk_usage', return_value=type('Usage', (), {'free': 1})()):
            with self.assertRaisesRegex(ValueError, 'espacio'):
                self.export(copy=True)
        self.assertFalse((self.base / 'Netflix').exists())

    def test_list_command_does_not_create_output(self):
        with patch('builtins.print'):
            code = EXPORT.main(['--root', str(self.root), '--list', '--output', str(self.base / 'Netflix')])
        self.assertEqual(code, 0)
        self.assertFalse((self.base / 'Netflix').exists())


if __name__ == '__main__':
    unittest.main()
