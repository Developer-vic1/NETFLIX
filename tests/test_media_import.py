"""Import safety tests: all source files are temporary, never user media."""
import importlib.util
import errno
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from types import SimpleNamespace
from urllib.parse import unquote

SPEC = importlib.util.spec_from_file_location('media_import', Path(__file__).resolve().parents[1] / 'scripts' / 'media_import.py')
media_import = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(media_import)


class MediaImportTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.root = self.base / 'application'
        self.root.mkdir()
        self.imports = media_import.MediaImports(self.root)

    def video(self, name='original.mp4', extra=0):
        source = self.base / name
        source.write_bytes((24).to_bytes(4, 'big') + b'ftypisom' + b'\0\0\0\0' + b'isommp42' + b'v' * extra)
        return source

    def finish(self, identifier):
        for _ in range(300):
            snapshot = self.imports.get(identifier)
            if snapshot['status'] != 'active':
                return snapshot
            time.sleep(0.01)
        self.fail('Import did not finish')

    def start(self, source, **metadata):
        descriptor = self.imports.register(source)
        identifier = self.imports.start({'sourceToken': descriptor['sourceToken'], 'title': 'Mi Película', 'kind': 'movie', **metadata})['id']
        return identifier

    def test_movie_moves_and_renames_complete_original(self):
        source = self.video(extra=3000)
        content = source.read_bytes()
        snapshot = self.finish(self.start(source))
        self.assertEqual(snapshot['status'], 'ready')
        self.assertFalse(source.exists())
        self.assertEqual((self.root / unquote(snapshot['result']['url'])).read_bytes(), content)
        self.assertEqual(snapshot['result']['url'], 'videos/mi-pelicula.mp4')
        self.assertEqual(snapshot['loaded'], snapshot['total'])
        self.assertNotIn(str(self.base), str(snapshot))

    def test_series_naming_preserves_season_and_episode(self):
        first = self.finish(self.start(self.video('chapter1.mp4'), title='Serie genial', kind='series', season=1, number=4))
        second = self.finish(self.start(self.video('chapter2.mp4'), title='Serie genial', kind='series', season=2, number=4))
        self.assertEqual(first['result']['url'], 'series/serie-genial_%234.mp4')
        self.assertEqual(second['result']['url'], 'series/serie-genial_T2_%234.mp4')

    def test_non_latin_title_has_stable_ascii_slug_and_moves(self):
        title = 'رحلة جميلة'
        slug = media_import.slug_title(title)
        self.assertRegex(slug, r'^titulo-[a-f0-9]{12}$')
        self.assertEqual(slug, media_import.slug_title(title))
        self.assertEqual(slug, media_import.slug_title(f' {title} '))
        self.assertNotEqual(slug, media_import.slug_title('日本映画'))
        source = self.video()
        content = source.read_bytes()
        snapshot = self.finish(self.start(source, title=title))
        self.assertEqual(snapshot['status'], 'ready')
        self.assertEqual(snapshot['result']['url'], f'videos/{slug}.mp4')
        self.assertFalse(source.exists())
        self.assertEqual((self.root / snapshot['result']['url']).read_bytes(), content)

    def test_cross_volume_copy_then_remove_original(self):
        source = self.video(extra=2 * media_import.CHUNK_BYTES)
        content = source.read_bytes()
        phases = []
        original_update = self.imports._update
        def observe(identifier, **changes):
            phases.append(changes)
            original_update(identifier, **changes)
        with patch.object(media_import, '_same_volume', return_value=False), patch.object(self.imports, '_update', side_effect=observe):
            snapshot = self.finish(self.start(source))
        self.assertEqual(snapshot['status'], 'ready')
        self.assertFalse(source.exists())
        self.assertEqual((self.root / unquote(snapshot['result']['url'])).read_bytes(), content)
        self.assertTrue(any(item.get('loaded', 0) == media_import.CHUNK_BYTES for item in phases))
        self.assertFalse(list((self.root / 'videos').glob('*.part')))

    def test_cancel_copy_keeps_original_and_removes_partial(self):
        source = self.video(extra=3 * media_import.CHUNK_BYTES)
        content = source.read_bytes()
        original_update = self.imports._update
        def cancel_after_chunk(identifier, **changes):
            original_update(identifier, **changes)
            if changes.get('loaded', 0) >= media_import.CHUNK_BYTES:
                self.imports.cancel(identifier)
        with patch.object(media_import, '_same_volume', return_value=False), patch.object(self.imports, '_update', side_effect=cancel_after_chunk):
            snapshot = self.finish(self.start(source))
        self.assertEqual(snapshot['status'], 'cancelled')
        self.assertEqual(source.read_bytes(), content)
        self.assertEqual(list((self.root / 'videos').iterdir()), [])

    def test_existing_destination_is_never_overwritten(self):
        destination = self.root / 'videos' / 'mi-pelicula.mp4'
        destination.parent.mkdir()
        destination.write_bytes(b'keep-this')
        source = self.video()
        with self.assertRaisesRegex(ValueError, 'library.destinationExists'):
            self.start(source)
        self.assertEqual(destination.read_bytes(), b'keep-this')
        self.assertTrue(source.exists())

    def test_import_already_at_destination_is_idempotent(self):
        folder = self.root / 'videos'
        folder.mkdir()
        source = self.video()
        destination = folder / 'mi-pelicula.mp4'
        source.rename(destination)
        snapshot = self.finish(self.start(destination))
        self.assertEqual(snapshot['status'], 'ready')
        self.assertTrue(destination.is_file())
        self.assertEqual(len(list(folder.iterdir())), 1)

    def test_invalid_container_and_extension_preserve_sources(self):
        wrong_extension = self.video('wrong.mov')
        with self.assertRaisesRegex(ValueError, 'library.mp4Required'):
            self.imports.register(wrong_extension)
        invalid = self.base / 'bad.mp4'
        invalid.write_bytes(b'not-an-MP4-container' * 2)
        with self.assertRaisesRegex(ValueError, 'library.mp4Invalid'):
            self.imports.register(invalid)
        self.assertTrue(invalid.exists())
        self.assertTrue(wrong_extension.exists())

    def test_invalid_metadata_and_path_like_title_do_not_escape_root(self):
        source = self.video()
        descriptor = self.imports.register(source)
        with self.assertRaisesRegex(ValueError, 'library.invalid'):
            self.imports.start({'sourceToken': descriptor['sourceToken'], 'title': 'x', 'kind': 'series', 'season': True, 'number': 1})
        snapshot = self.finish(self.start(source, title='../../CON\\target'))
        self.assertEqual(snapshot['result']['url'], 'videos/con-target.mp4')
        self.assertTrue((self.root / 'videos' / 'con-target.mp4').exists())
        self.assertEqual(media_import.slug_title('CON'), 'titulo-con')

    def test_permission_denied_keeps_original(self):
        source = self.video()
        with patch.object(media_import, '_rename_no_replace', side_effect=PermissionError('denied')):
            snapshot = self.finish(self.start(source))
        self.assertEqual(snapshot['status'], 'error')
        self.assertEqual(snapshot['error'], 'library.permissionDenied')
        self.assertTrue(source.exists())

    def test_actual_cross_volume_rename_falls_back_to_copy(self):
        source = self.video(extra=4000)
        original_rename = media_import._rename_no_replace
        def cross_volume(original, destination):
            if original == source:
                raise OSError(errno.EXDEV, 'Different filesystem')
            return original_rename(original, destination)
        with patch.object(media_import, '_same_volume', return_value=True), patch.object(media_import, '_rename_no_replace', side_effect=cross_volume):
            snapshot = self.finish(self.start(source))
        self.assertEqual(snapshot['status'], 'ready')
        self.assertFalse(source.exists())

    def test_cancel_during_commit_does_not_destroy_final_file(self):
        source = self.video(extra=2000)
        original_rename = media_import._rename_no_replace
        def cancel_at_commit(original, destination):
            active = next(identifier for identifier, entry in self.imports._jobs.items() if entry['snapshot']['status'] == 'active')
            self.imports.cancel(active)
            return original_rename(original, destination)
        with patch.object(media_import, '_rename_no_replace', side_effect=cancel_at_commit):
            snapshot = self.finish(self.start(source))
        self.assertEqual(snapshot['status'], 'ready')
        self.assertFalse(source.exists())
        self.assertTrue((self.root / unquote(snapshot['result']['url'])).is_file())

    def test_remove_original_failure_rolls_back_copy(self):
        source = self.video(extra=100)
        original_unlink = Path.unlink
        def refuse_source_unlink(path, *args, **kwargs):
            if path == source:
                raise PermissionError('Original locked')
            return original_unlink(path, *args, **kwargs)
        with patch.object(media_import, '_same_volume', return_value=False), patch.object(Path, 'unlink', refuse_source_unlink):
            snapshot = self.finish(self.start(source))
        self.assertEqual(snapshot['status'], 'error')
        self.assertEqual(snapshot['error'], 'library.permissionDenied')
        self.assertTrue(source.exists())
        self.assertEqual(list((self.root / 'videos').iterdir()), [])

    def test_active_source_cannot_be_imported_twice(self):
        source = self.video()
        entered, release = threading.Event(), threading.Event()
        self.addCleanup(release.set)
        original_same_volume = media_import._same_volume
        def wait_before_move(original, destination):
            entered.set()
            release.wait(2)
            return original_same_volume(original, destination)
        with patch.object(media_import, '_same_volume', side_effect=wait_before_move):
            identifier = self.start(source)
            self.assertTrue(entered.wait(2))
            with self.assertRaisesRegex(ValueError, 'library.importBusy'):
                self.start(source)
            self.imports.cancel(identifier)
            release.set()
            snapshot = self.finish(identifier)
        self.assertEqual(snapshot['status'], 'cancelled')
        self.assertTrue(source.exists())

    def test_destination_created_during_import_is_not_replaced(self):
        source = self.video()
        original_rename = media_import._rename_no_replace
        def competing_destination(original, destination):
            destination.write_bytes(b'external-file')
            return original_rename(original, destination)
        with patch.object(media_import, '_rename_no_replace', side_effect=competing_destination):
            snapshot = self.finish(self.start(source))
        self.assertEqual(snapshot['status'], 'error')
        self.assertEqual(snapshot['error'], 'library.destinationExists')
        self.assertTrue(source.exists())
        self.assertEqual((self.root / 'videos' / 'mi-pelicula.mp4').read_bytes(), b'external-file')

    def test_picker_cancellation_and_descriptor(self):
        self.assertIsNone(media_import.MediaImports(self.root, pick_fn=lambda: '').pick())
        source = self.video()
        picker = media_import.MediaImports(self.root, pick_fn=lambda: str(source))
        descriptor = picker.pick()
        self.assertEqual(descriptor['name'], 'original.mp4')
        self.assertEqual(picker.source(descriptor['sourceToken']), source)
        self.assertNotIn(str(self.base), str(descriptor))

    def test_relative_source_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'library.sourceUnavailable'):
            self.imports.register('relative.mp4')

    def test_selected_source_modified_before_start_is_rejected(self):
        source = self.video(extra=100)
        descriptor = self.imports.register(source)
        source.write_bytes(source.read_bytes() + b'new-data')
        with self.assertRaisesRegex(ValueError, 'library.sourceChanged'):
            self.imports.start({'sourceToken': descriptor['sourceToken'], 'title': 'Movie', 'kind': 'movie'})
        self.assertTrue(source.exists())
        self.assertFalse((self.root / 'videos').exists())

    def test_same_size_source_with_changed_mtime_is_rejected(self):
        source = self.video(extra=100)
        descriptor = self.imports.register(source)
        stat = source.stat()
        os.utime(source, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1000000000))
        with self.assertRaisesRegex(ValueError, 'library.sourceChanged'):
            self.imports.start({'sourceToken': descriptor['sourceToken'], 'title': 'Movie', 'kind': 'movie'})
        self.assertTrue(source.exists())

    def test_cross_volume_insufficient_space_keeps_original(self):
        source = self.video(extra=3000)
        with patch.object(media_import, '_same_volume', return_value=False), patch.object(media_import.shutil, 'disk_usage', return_value=SimpleNamespace(free=5)):
            snapshot = self.finish(self.start(source))
        self.assertEqual(snapshot['status'], 'error')
        self.assertEqual(snapshot['error'], 'library.spaceError')
        self.assertTrue(source.exists())
        self.assertEqual(list((self.root / 'videos').iterdir()), [])

    def test_idle_token_retention_is_bounded(self):
        source = self.video()
        with patch.object(media_import, 'MAX_RETAINED', 3):
            descriptors = [self.imports.register(source) for _ in range(5)]
        self.assertEqual(len(self.imports._sources), 3)
        self.assertIsNone(self.imports.source(descriptors[0]['sourceToken']))
        self.assertEqual(self.imports.source(descriptors[-1]['sourceToken']), source)

    def test_symlink_source_is_rejected(self):
        source = self.video()
        link = self.base / 'linked.mp4'
        try:
            link.symlink_to(source)
        except OSError:
            self.skipTest('Symlink creation unavailable')
        with self.assertRaisesRegex(ValueError, 'library.sourceUnavailable'):
            self.imports.register(link)


if __name__ == '__main__':
    unittest.main()
