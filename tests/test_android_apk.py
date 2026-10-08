import importlib.util
import tempfile
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location('android_apk', Path(__file__).resolve().parents[1] / 'scripts/check-android-apk.py')
apk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(apk)


class AndroidPackagingTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.path = Path(self.folder.name) / 'app.apk'

    def create(self, windows=False, private=False):
        with zipfile.ZipFile(self.path, 'w', zipfile.ZIP_DEFLATED) as archive:
            for name in ['AndroidManifest.xml', 'classes.dex', 'assets/www/index.html',
                         'assets/www/js/app.js', 'assets/www/css/base.css']:
                archive.writestr(name.replace('/', '\\') if windows else name, 'fixture')
            if private:
                archive.writestr('assets/www/secret.mp4', 'not permitted')

    def test_valid_packaged_files(self):
        self.create()
        apk.validate(self.path)

    def test_mismatched_local_header_rejected(self):
        self.create()
        data = self.path.read_bytes()
        self.path.write_bytes(data.replace(b'assets/www/index.html', b'assets/www\\index.html', 1))
        with self.assertRaisesRegex(ValueError, 'cannot resolve'):
            apk.validate(self.path)

    def test_windows_paths_normalized_before_signing(self):
        self.create(windows=True)
        normalized = Path(self.folder.name) / 'normalized.apk'
        apk.normalize(self.path, normalized)
        apk.validate(normalized)
        with zipfile.ZipFile(normalized) as archive:
            self.assertEqual(archive.read('assets/www/index.html'), b'fixture')

    def test_private_media_rejected(self):
        self.create(private=True)
        with self.assertRaisesRegex(ValueError, 'Private media'):
            apk.validate(self.path)


if __name__ == '__main__':
    unittest.main()
