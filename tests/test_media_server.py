"""Local upload contract: MP4 bytes are saved unchanged and invalid formats fail."""
import http.client
import importlib.util
import json
from pathlib import Path
import tempfile
from threading import Thread
import unittest
import time
from urllib.parse import unquote

from http.server import ThreadingHTTPServer


spec = importlib.util.spec_from_file_location('netflix_server', Path(__file__).resolve().parents[1] / 'scripts' / 'serve.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class UploadTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        module.MEDIA = Path(self.temp.name)
        self.application = Path(self.temp.name) / 'application'
        self.application.mkdir()
        module.IMPORTS = module.MediaImports(self.application)
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

    def test_mkv_upload_preserves_container_and_rejects_renamed_webm(self):
        content = bytes.fromhex('1a45dfa38b4282886d6174726f736b6118538067ff') + b'video-packets'
        status, body = self.request(content, 'clip.mkv')
        self.assertEqual(status, 201)
        saved = json.loads(body)
        self.assertTrue(saved['url'].endswith('.mkv'))
        self.assertEqual((module.MEDIA / Path(saved['url']).name).read_bytes(), content)
        webm = bytes.fromhex('1a45dfa3874282847765626d18538067ff') + b'video-packets'
        self.assertEqual(self.request(webm, 'renamed.mkv')[0], 415)

    def json_request(self, method, path, body=None, origin=True):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
        headers = {'Content-Type': 'application/json'}
        if origin:
            headers['Origin'] = f'http://127.0.0.1:{self.server.server_port}'
        connection.request(method, path, json.dumps(body) if body is not None else None, headers)
        response = connection.getresponse()
        result = response.status, json.loads(response.read())
        connection.close()
        return result

    def test_native_path_preview_and_move_without_duplicate(self):
        original = Path(self.temp.name) / 'external.mp4'
        content = bytes.fromhex('000000206674797069736f6d0000020069736f6d69736f32617663316d703431') + b'video-data'
        original.write_bytes(content)
        status, source = self.json_request('POST', '/api/media/source', {'path': str(original)})
        self.assertEqual(status, 200)
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
        connection.request('GET', source['url'], headers={'Range': 'bytes=0-19'})
        response = connection.getresponse()
        self.assertEqual(response.status, 206)
        self.assertEqual(response.read(), content[:20])
        connection.close()
        status, task = self.json_request('POST', '/api/imports', {'sourceToken': source['sourceToken'], 'title': 'Mi serie', 'kind': 'series', 'season': 1, 'number': 2})
        self.assertEqual(status, 200)
        for _ in range(200):
            status, job = self.json_request('GET', f"/api/imports/{task['id']}")
            if job['status'] != 'active': break
            time.sleep(.01)
        self.assertEqual(job['status'], 'ready')
        self.assertFalse(original.exists())
        self.assertEqual((self.application / unquote(job['result']['url'])).read_bytes(), content)
        self.assertEqual(self.json_request('POST', '/api/media/source', {'path': str(original)}, origin=False)[0], 403)


if __name__ == '__main__':
    unittest.main()
