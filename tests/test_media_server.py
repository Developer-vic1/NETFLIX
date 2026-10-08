"""Local upload contract: MP4 bytes are saved unchanged and invalid formats fail."""
import http.client
import importlib.util
import json
from pathlib import Path
import tempfile
from threading import Thread
import unittest

from http.server import ThreadingHTTPServer


spec = importlib.util.spec_from_file_location('netflix_server', Path(__file__).resolve().parents[1] / 'scripts' / 'serve.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class UploadTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        module.MEDIA = Path(self.temp.name)
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), module.Handler)
        self.worker = Thread(target=self.server.serve_forever, daemon=True)
        self.worker.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.worker.join()
        self.temp.cleanup()

    def request(self, data, name='clip.mp4'):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
        connection.request('POST', '/api/media', body=data, headers={
            'Origin': f'http://127.0.0.1:{self.server.server_port}',
            'Content-Type': 'video/mp4',
            'X-Media-Name': name,
        })
        response = connection.getresponse()
        result = response.status, response.read()
        connection.close()
        return result

    def test_complete_mp4_and_rejections(self):
        valid = bytes.fromhex('000000206674797069736f6d0000020069736f6d69736f32617663316d703431') + b'complete-video-bytes'
        status, body = self.request(valid)
        self.assertEqual(status, 201)
        saved = json.loads(body)
        self.assertEqual((module.MEDIA / Path(saved['url']).name).read_bytes(), valid)
        self.assertEqual(saved['size'], len(valid))
        self.assertEqual(self.request(valid, 'clip.webm')[0], 415)
        self.assertEqual(self.request(b'not an mp4' * 4)[0], 415)
        self.assertEqual(len(list(module.MEDIA.glob('*.mp4'))), 1)


if __name__ == '__main__':
    unittest.main()
