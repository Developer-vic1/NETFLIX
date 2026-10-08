"""USB synchronization preserves complete files and the previous catalog on failure."""
from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
import shlex
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import quote
import uuid
import zipfile

SCRIPT = Path(__file__).resolve().parent.parent / 'scripts/connect-android.py'
SPEC = importlib.util.spec_from_file_location('android_usb', SCRIPT)
USB = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(USB)


class DeviceSelectionTests(unittest.TestCase):
    def test_only_authorized_usb_devices_are_offered(self):
        output = '''List of devices attached
abc123 device product:redmi model:Redmi_Note_14 device:test transport_id:1
locked unauthorized usb:1-2
offline offline
192.168.1.8:5555 device model:Pixel
adb-test._adb-tls-connect._tcp device model:Pixel
emulator-5554 device model:Android
'''
        self.assertEqual(USB.parse_devices(output), [{'serial': 'abc123', 'model': 'Redmi Note 14'}])

    def test_multiple_devices_require_selection_then_confirmation(self):
        answers = iter(['2', 'Sí'])
        devices = [{'serial': 'first', 'model': 'One'}, {'serial': 'second', 'model': 'Two'}]
        selected = USB.choose_device(devices, read=lambda _: next(answers), report=lambda _: None)
        self.assertEqual(selected['serial'], 'second')

    def test_single_device_still_requires_explicit_confirmation(self):
        with self.assertRaisesRegex(RuntimeError, 'cancelada'):
            USB.choose_device([{'serial': 'first', 'model': 'One'}], read=lambda _: '', report=lambda _: None)

    def test_missing_serial_never_falls_back_to_another_device(self):
        with self.assertRaisesRegex(RuntimeError, 'no está disponible'):
            USB.choose_device([{'serial': 'other', 'model': 'One'}], serial='wanted', report=lambda _: None)

    def test_bad_selection_and_no_devices_explain_recovery(self):
        with self.assertRaisesRegex(RuntimeError, 'Selección no válida'):
            USB.choose_device([{'serial': 'a', 'model': 'A'}, {'serial': 'b', 'model': 'B'}], read=lambda _: '99', report=lambda _: None)
        with self.assertRaisesRegex(RuntimeError, 'Depuración USB'):
            USB.choose_device([], report=lambda _: None)


class IncrementalCatalogTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.video = self.root / 'video.mp4'
        self.video.write_bytes(b'complete movie' * 400)
        self.cover = self.root / 'cover.png'
        self.cover.write_bytes(b'cover')
        self.relative = 'series/isla_T11_#1.mp4'
        self.record = {'id': 'local-series-' + str(uuid.uuid4()), 'status': 'published', 'kind': 'series',
                       'metadata': {'name': 'Isla'}, 'coverUrl': 'data/library/covers/isla.png',
                       'episodes': [{'id': 'episode-' + str(uuid.uuid4()), 'number': 1, 'season': 11,
                                     'video': {'url': quote(self.relative, safe='/'), 'name': 'isla_T11_#1.mp4',
                                               'size': self.video.stat().st_size}}]}
        self.plan = {'records': [self.record], 'files': {
            self.relative: {'path': self.video, 'size': self.video.stat().st_size, 'video': True},
            'data/library/covers/isla.png': {'path': self.cover, 'size': 5, 'video': False}}}

    def inspect(self, files):
        return lambda path: files.get(path)

    def prepare(self, files):
        return USB.sync_plan(self.plan, self.inspect(files), report=lambda _: None)

    def test_identical_files_require_zero_media_transfer(self):
        files = {name: (item['size'], USB.hash_file(item['path'])) for name, item in self.plan['files'].items()}
        prepared = self.prepare(files)
        self.assertEqual(prepared['bytes'], 0)
        self.assertTrue(all(item['skip'] for item in prepared['files']))
        catalog = json.loads(prepared['catalog'])
        self.assertEqual(catalog['records'], self.plan['records'])

    def test_new_episode_only_transfers_missing_bytes(self):
        files = {'data/library/covers/isla.png': (5, USB.hash_file(self.cover))}
        prepared = self.prepare(files)
        self.assertEqual(prepared['bytes'], self.video.stat().st_size)
        self.assertEqual([item['relative'] for item in prepared['files'] if not item['skip']], [self.relative])

    def test_changed_same_name_preserves_old_video_and_updates_encoded_reference(self):
        original = deepcopy(self.plan)
        prepared = self.prepare({self.relative: (100, 'a' * 64)})
        new_relative = USB.hash_name(self.relative, USB.hash_file(self.video))
        self.assertEqual(prepared['files'][0]['relative'], new_relative)
        episode = json.loads(prepared['catalog'])['records'][0]['episodes'][0]
        self.assertEqual(episode['video']['url'], quote(new_relative, safe='/'))
        self.assertIn('%23', episode['video']['url'])
        self.assertEqual(self.plan, original)
        self.assertEqual(self.video.read_bytes(), b'complete movie' * 400)

    def test_retry_reuses_complete_hashed_file_without_duplicate_upload(self):
        digest = USB.hash_file(self.video)
        name = USB.hash_name(self.relative, digest)
        prepared = self.prepare({self.relative: (1, 'b' * 64), name: (self.video.stat().st_size, digest)})
        self.assertTrue(prepared['files'][0]['skip'])
        self.assertEqual(prepared['bytes'], 5)

    def test_hash_collision_or_corrupt_hashed_file_never_overwrites(self):
        name = USB.hash_name(self.relative, USB.hash_file(self.video))
        with self.assertRaisesRegex(RuntimeError, 'colisión'):
            self.prepare({self.relative: (1, 'b' * 64), name: (3, 'c' * 64)})

    def test_changed_source_size_does_not_publish_mismatching_metadata(self):
        self.video.write_bytes(b'changed')
        with self.assertRaisesRegex(RuntimeError, 'tamaño'):
            self.prepare({})

    def test_unsafe_paths_are_rejected_before_remote_command(self):
        for value in ('../video.mp4', '/sdcard/video.mp4', 'videos/../a.mp4', 'videos/a.mp4\nrm', 'videos//a.mp4', 'data/library/secret.txt'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                USB.remote_path(value)

    def test_large_hash_name_and_cover_stay_compatible_with_android_patterns(self):
        name = USB.hash_name('data/library/covers/' + 'a' * 240 + '.png', 'd' * 64)
        self.assertLess(len(Path(name).name), 255)
        self.assertRegex(name, r'^data/library/covers/[a-zA-Z0-9_-]+\.png$')

    def test_hash_reads_full_content_across_multiple_blocks(self):
        data = b'a' * (USB.CHUNK + 7) + b'end'
        self.video.write_bytes(data)
        self.assertEqual(USB.hash_file(self.video), hashlib.sha256(data).hexdigest())


class InstallationSequenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        apk = self.root / 'releases/Netflix-Android.apk'
        apk.parent.mkdir()
        with zipfile.ZipFile(apk, 'w') as archive:
            archive.writestr('AndroidManifest.xml', 'test manifest')
            archive.writestr('classes.dex', 'test dex')
        self.events = []
        events = self.events

        class FakeUsb:
            def __init__(self, *args):
                self.total = 0
            def check_catalog(self):
                events.append('check_catalog')
            def inspect(self, path):
                return None
            def free_bytes(self):
                return 10 ** 10
            def run(self, *args, **kwargs):
                events.append(args)
                if args == ('get-state',):
                    return 'device'
                return 'Success'
            def transfer(self, item, replace_catalog=False):
                events.append('catalog' if replace_catalog else 'video')
        self.fake = FakeUsb
        self.prepared = {'files': [{'path': self.root / 'source.mp4', 'relative': 'videos/source.mp4', 'hash': 'a' * 64,
                                    'size': 50, 'skip': False}], 'catalog': b'{"version":1,"records":[]}', 'bytes': 50, 'records': 1}

    def execute(self):
        process = subprocess.CompletedProcess(['adb'], 0, 'List of devices attached\nconfirmed device model:Redmi\n', '')
        with patch.object(USB, 'locate_adb', return_value='fake-adb'), \
             patch.object(USB, 'load_export_plan', return_value={'records': [{}], 'bytes': 50}), \
             patch.object(USB, 'sync_plan', return_value=self.prepared), \
             patch.object(USB, 'AndroidUsb', self.fake), \
             patch.object(USB.subprocess, 'run', return_value=process), \
             patch.object(USB, 'choose_device', return_value={'serial': 'confirmed', 'model': 'Redmi'}):
            return USB.main(['--root', str(self.root)])

    def test_complete_video_is_verified_before_catalog_and_launch(self):
        self.assertEqual(self.execute(), 0)
        self.assertLess(self.events.index('video'), self.events.index('catalog'))
        self.assertLess(self.events.index('catalog'), self.events.index(('shell', 'am start -n com.netflix.local/.MainActivity')))
        self.assertIn(('install', '--no-incremental', '-r', str(self.root / 'releases/Netflix-Android.apk')), self.events)

    def test_interrupted_video_does_not_publish_catalog_or_restart_app(self):
        def interrupted(*args, **kwargs):
            raise RuntimeError('USB disconnected')
        with patch.object(self.fake, 'transfer', interrupted):
            with self.assertRaisesRegex(RuntimeError, 'USB disconnected'):
                self.execute()
        self.assertNotIn('catalog', self.events)
        self.assertNotIn(('shell', 'am start -n com.netflix.local/.MainActivity'), self.events)

    def test_insufficient_space_prevents_installation_and_transfer(self):
        with patch.object(self.fake, 'free_bytes', lambda _: 1):
            with self.assertRaisesRegex(RuntimeError, 'espacio suficiente'):
                self.execute()
        self.assertFalse(any(isinstance(event, tuple) and event[0] == 'install' for event in self.events))
        self.assertNotIn('video', self.events)

    def test_invalid_apk_rejected_before_device_changes(self):
        apk = self.root / 'releases/Netflix-Android.apk'
        apk.write_bytes(b'not an apk')
        with self.assertRaisesRegex(RuntimeError, 'APK'):
            self.execute()
        self.assertEqual(self.events, [])


class VerifiedTransferTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.source = Path(self.temp.name) / 'film.mp4'
        self.payload = b'complete original film'
        self.source.write_bytes(self.payload)
        self.relative = 'videos/film.mp4'
        self.item = {'path': self.source, 'relative': self.relative, 'size': len(self.payload),
                     'hash': hashlib.sha256(self.payload).hexdigest()}
        self.files = {'/sdcard/Download/personal.mp4': b'personal file'}
        self.corrupt = False
        self.raced = False
        owner = self

        class Harness(USB.AndroidUsb):
            def shell(self, command, **kwargs):
                tokens = shlex.split(command)
                if tokens[0] == 'mkdir':
                    return ''
                if tokens[:3] == ['test', '!', '-e']:
                    if tokens[3] in owner.files:
                        raise RuntimeError('exists')
                    return ''
                if tokens[0] == 'stat':
                    path = tokens[3].removesuffix(';')
                    data = owner.files[path]
                    digest = '0' * 64 if owner.corrupt else hashlib.sha256(data).hexdigest()
                    return str(len(data)) + '\n' + digest + '  ' + path
                if tokens[:2] == ['mv', '-n']:
                    source, destination = tokens[2:4]
                    if owner.raced:
                        owner.files[destination] = b'other process movie'
                    if destination in owner.files:
                        raise RuntimeError('Destination occupied')
                    owner.files[destination] = owner.files.pop(source)
                    return ''
                if tokens[:2] == ['rm', '-f']:
                    owner.files.pop(tokens[2], None)
                    return ''
                raise AssertionError(command)

        class FakePush:
            returncode = 0
            def __init__(self, args, **kwargs):
                owner.files[args[-1]] = Path(args[-2]).read_bytes()
            def communicate(self, **kwargs):
                return 'complete', None
            def poll(self):
                return 0

        self.usb = Harness('fake-adb', 'confirmed', report=lambda _: None)
        self.usb.total = len(self.payload)
        self.push = FakePush

    def test_complete_hash_verified_file_publishes_without_leaving_partials(self):
        with patch.object(USB.subprocess, 'Popen', self.push):
            self.usb.transfer(self.item)
        self.assertEqual(self.files[USB.remote_path(self.relative)], self.payload)
        self.assertFalse(any('.part' in path for path in self.files))
        self.assertEqual(self.files['/sdcard/Download/personal.mp4'], b'personal file')

    def test_bad_sha_never_publishes_or_deletes_an_unrelated_file(self):
        self.corrupt = True
        with patch.object(USB.subprocess, 'Popen', self.push):
            with self.assertRaisesRegex(RuntimeError, 'SHA-256'):
                self.usb.transfer(self.item)
        self.assertNotIn(USB.remote_path(self.relative), self.files)
        self.assertEqual(self.files, {'/sdcard/Download/personal.mp4': b'personal file'})
        self.assertEqual(self.usb.completed, 0)

    def test_raced_destination_is_preserved_and_own_partial_cleaned(self):
        self.raced = True
        with patch.object(USB.subprocess, 'Popen', self.push):
            with self.assertRaisesRegex(RuntimeError, 'occupied'):
                self.usb.transfer(self.item)
        self.assertEqual(self.files[USB.remote_path(self.relative)], b'other process movie')
        self.assertFalse(any('.part' in path for path in self.files))
        self.assertEqual(self.usb.completed, 0)


if __name__ == '__main__':
    unittest.main()
