"""Android preparation never copies private media or writes desktop sources."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parent.parent / 'scripts/prepare-android-web.py'
SPEC = importlib.util.spec_from_file_location('android_web', SCRIPT)
WEB = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(WEB)


class AndroidWebPreparationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.destination = self.root / 'output/bundle/www'
        (self.root / 'index.html').write_bytes(b'public application')
        (self.root / 'assets').mkdir()
        (self.root / 'assets/image.webp').write_bytes(b'public image')

    def test_only_declared_public_assets_are_planned(self):
        private = self.root / 'videos'
        private.mkdir()
        (private / 'private.mp4').write_bytes(b'private media')
        plan = WEB.asset_plan(self.root, self.destination,
                              ['/index.html', '/', '/assets/image.webp', '/sw.js', '/assets/offline-manifest.json'])
        self.assertEqual([source.relative_to(self.root).as_posix() for source, _ in plan],
                         ['index.html', 'assets/image.webp'])
        self.assertFalse(self.destination.exists())

    def test_private_media_and_signing_material_cannot_be_manifest_assets(self):
        for asset in ['/videos/film.mp4', '/assets/film.MP4', '/assets/film.mkv',
                      '/android-local/.keys/android-local.jks', '/vendor/python/python.exe',
                      '/data/library/catalog.json']:
            with self.subTest(asset=asset), self.assertRaises(ValueError):
                WEB.asset_plan(self.root, self.destination, [asset])

    def test_traversal_windows_paths_and_external_paths_are_rejected(self):
        for asset in ['/../private.html', '/assets/../../private.html', '//index.html',
                      '/C:/private.html', '/assets\\secret.js']:
            with self.subTest(asset=asset), self.assertRaises(ValueError):
                WEB.asset_plan(self.root, self.destination, [asset])

    def test_destination_cannot_overwrite_source_directories(self):
        for destination in [self.root, self.root / 'js', self.root / 'assets', self.root.parent / 'outside']:
            with self.subTest(destination=destination), self.assertRaises(ValueError):
                WEB.validate_destination(self.root, destination)
        self.assertEqual(WEB.validate_destination(self.root, self.destination), self.destination)
        android_destination = self.root / 'android-local/build/assets/www'
        self.assertEqual(WEB.validate_destination(self.root, android_destination), android_destination)

    def test_linked_asset_cannot_leak_an_external_source(self):
        linked = self.root / 'assets/leak.js'
        try:
            linked.symlink_to(SCRIPT)
        except (OSError, NotImplementedError):
            self.skipTest('Symbolic links are not permitted on this host.')
        with self.assertRaises(ValueError):
            WEB.asset_plan(self.root, self.destination, ['/assets/leak.js'])

    def test_manifest_is_validated_before_any_output_is_written(self):
        with self.assertRaises(ValueError):
            WEB.asset_plan(self.root, self.destination, ['/index.html', '/assets/missing.js'])
        self.assertFalse(self.destination.exists())
        self.assertEqual((self.root / 'index.html').read_bytes(), b'public application')

    def test_changed_adapter_anchor_fails_without_silent_replacement(self):
        self.destination.mkdir(parents=True)
        file = self.destination / 'index.html'
        file.write_bytes(b'changed desktop source\r\n')
        with self.assertRaisesRegex(ValueError, 'Mobile adapter needs updating'):
            WEB.patch(self.destination, 'index.html', 'missing anchor', 'mobile replacement')
        self.assertEqual(file.read_bytes(), b'changed desktop source\r\n')


if __name__ == '__main__':
    unittest.main()
