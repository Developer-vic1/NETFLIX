"""Real HTTP pairing, catalog refresh and verified bounded media downloads."""
from copy import deepcopy
import hashlib
import http.client
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.parse import quote
from unittest.mock import patch
import uuid

SCRIPT = Path(__file__).resolve().parent.parent / 'scripts/share-library.py'
SPEC = importlib.util.spec_from_file_location('wifi_share', SCRIPT)
SHARE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SHARE)


class WifiShareTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.catalog = self.root / 'data/library/catalog.json'
        self.catalog.parent.mkdir(parents=True)
        self.cover = 'data/library/covers/cover.png'
        (self.root / self.cover).parent.mkdir()
        (self.root / self.cover).write_bytes(b'bounded-real-cover')
        self.content = (24).to_bytes(4, 'big') + b'ftypisom' + b'\0\0\0\0' + b'isommp42' + bytes(range(256)) * 100
        self.relative = 'series/isla_T11_#1.mp4'
        (self.root / 'series').mkdir()
        (self.root / self.relative).write_bytes(self.content)
        self.record = {
            'id': 'local-series-' + str(uuid.uuid4()), 'kind': 'series', 'status': 'published',
            'metadata': {'name': 'La isla', 'description': 'Una descripción real guardada del programa.', 'creator': 'Productora', 'genre': 'Reality', 'year': 2026, 'ageRating': '18+', 'originalLanguage': 'es'},
            'coverUrl': self.cover, 'updatedAt': '2026-10-08T12:00:00Z',
            'episodes': [{'id': 'episode-' + str(uuid.uuid4()), 'number': 1, 'season': 11, 'name': 'Capítulo 1', 'description': '', 'video': {'url': quote(self.relative, safe='/'), 'size': len(self.content), 'name': 'isla.mp4'}, 'media': {'duration': 5000, 'width': 1280, 'height': 720}}],
        }
        self.write_catalog([self.record])
        self.server = SHARE.LibraryServer(('127.0.0.1', 0), self.root, '123456')
        self.worker = threading.Thread(target=self.server.serve_forever, kwargs={'poll_interval': .01}, daemon=True)
        self.worker.start()
        self.addCleanup(self.close_server)
        self.token = None

    def close_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.worker.join(timeout=3)

    def write_catalog(self, records):
        self.catalog.write_text(json.dumps({'version': 1, 'records': records}), encoding='utf-8')

    def request(self, method, path, payload=None, authenticated=True, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        self.addCleanup(connection.close)
        selected = dict(headers or {})
        if authenticated and self.token:
            selected['Authorization'] = 'Bearer ' + self.token
        data = json.dumps(payload).encode() if payload is not None else None
        if data is not None:
            selected['Content-Type'] = 'application/json'
        connection.request(method, path, body=data, headers=selected)
        response = connection.getresponse()
        body = response.read()
        return response.status, dict(response.getheaders()), body

    def pair(self):
        status, _, body = self.request('POST', '/api/pair', {'code': '123456'}, False)
        self.assertEqual(status, 200)
        result = json.loads(body)
        self.token = result['token']
        self.assertEqual(result['expiresIn'], 7200)

    def test_unauthenticated_catalog_manifest_files_and_root_do_not_leak(self):
        for path in ('/', '/api/status', '/api/catalog', '/api/manifest', '/api/files/' + quote(self.relative, safe='/')):
            status, _, body = self.request('GET', path, authenticated=False)
            self.assertEqual(status, 401)
            self.assertNotIn(b'La isla', body)

    def test_status_heartbeat_does_not_read_or_validate_library(self):
        self.pair()
        with patch.object(self.server.library, 'snapshot', side_effect=AssertionError('Heartbeat must not access files')):
            status, _, body = self.request('GET', '/api/status')
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {'status': 'connected'})
        self.assertEqual(self.request('GET', '/api/status?anything=1')[0], 404)

    def test_status_rejects_wrong_and_expired_tokens_and_remains_read_only(self):
        self.token = 'invalid-token'
        self.assertEqual(self.request('GET', '/api/status')[0], 401)
        self.pair()
        address, _ = self.server.pairing.tokens[self.token]
        self.server.pairing.tokens[self.token] = (address, self.server.pairing.clock() - 1)
        self.assertEqual(self.request('GET', '/api/status')[0], 401)
        for method in ('POST', 'PUT', 'PATCH', 'DELETE'):
            self.assertEqual(self.request(method, '/api/status')[0], 405)

    def test_pairing_code_is_mandatory_and_attempts_are_bounded(self):
        for _ in range(6):
            self.assertEqual(self.request('POST', '/api/pair', {'code': '000000'}, False)[0], 403)
        status, headers, _ = self.request('POST', '/api/pair', {'code': '123456'}, False)
        self.assertEqual(status, 429)
        self.assertEqual(headers['Retry-After'], '60')

    def test_pair_rejects_extra_fields_numeric_codes_and_large_request(self):
        self.assertEqual(self.request('POST', '/api/pair', {'code': '123456', 'root': 'C:'}, False)[0], 400)
        self.assertEqual(self.request('POST', '/api/pair', {'code': 123456}, False)[0], 403)
        self.assertEqual(self.request('POST', '/api/pair', {'code': 'éééééé'}, False)[0], 403)
        self.assertEqual(self.request('POST', '/api/pair', {'code': 'x' * 5000}, False)[0], 400)

    def test_catalog_preserves_episode_ids_metadata_and_encoded_urls(self):
        self.pair()
        status, _, body = self.request('GET', '/api/catalog')
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {'version': 1, 'records': [self.record]})

    def test_new_title_is_visible_without_server_restart_and_drafts_are_excluded(self):
        self.pair()
        another = deepcopy(self.record)
        another['id'] = 'local-series-' + str(uuid.uuid4())
        another['metadata']['name'] = 'Otra serie'
        draft = deepcopy(another)
        draft.update(id='local-series-' + str(uuid.uuid4()), status='draft')
        self.write_catalog([self.record, another, draft])
        result = json.loads(self.request('GET', '/api/catalog')[2])
        self.assertEqual([value['id'] for value in result['records']], [self.record['id'], another['id']])

    def test_manifest_contains_real_sha256_sizes_and_decoded_paths(self):
        self.pair()
        status, _, body = self.request('GET', '/api/manifest?ids=' + self.record['id'])
        self.assertEqual(status, 200)
        manifest = json.loads(body)
        files = {value['path']: value for value in manifest['files']}
        self.assertEqual(set(files), {self.relative, self.cover})
        self.assertEqual(files[self.relative], {'path': self.relative, 'size': len(self.content), 'sha256': hashlib.sha256(self.content).hexdigest(), 'mime': 'video/mp4'})
        self.assertEqual(manifest['records'], [self.record])

    def test_selected_manifest_excludes_unselected_titles(self):
        self.pair()
        another = deepcopy(self.record)
        another.update(id='local-series-' + str(uuid.uuid4()))
        self.write_catalog([self.record, another])
        result = json.loads(self.request('GET', '/api/manifest?ids=' + self.record['id'])[2])
        self.assertEqual(result['records'], [self.record])
        self.assertEqual(self.request('GET', '/api/manifest?ids=missing')[0], 404)
        self.assertEqual(self.request('GET', '/api/manifest?ids=')[0], 409)
        self.assertEqual(self.request('GET', '/api/manifest?anything=1')[0], 409)

    def test_file_stream_preserves_entire_source_and_percent_encoded_hash_name(self):
        self.pair()
        status, headers, body = self.request('GET', '/api/files/' + quote(self.relative, safe='/'))
        self.assertEqual(status, 200)
        self.assertEqual(body, self.content)
        self.assertEqual(int(headers['Content-Length']), len(self.content))
        self.assertEqual(headers['Content-Type'], 'video/mp4')
        self.assertEqual((self.root / self.relative).read_bytes(), self.content)

    def test_resume_range_suffix_head_and_unsatisfiable_ranges(self):
        self.pair()
        path = '/api/files/' + quote(self.relative, safe='/')
        for header, expected in (('bytes=10-19', self.content[10:20]), ('bytes=100-', self.content[100:]), ('bytes=-10', self.content[-10:])):
            status, metadata, body = self.request('GET', path, headers={'Range': header})
            self.assertEqual(status, 206)
            self.assertEqual(body, expected)
            self.assertEqual(int(metadata['Content-Length']), len(expected))
            self.assertIn('Content-Range', metadata)
        status, metadata, body = self.request('HEAD', path, headers={'Range': 'bytes=1-10'})
        self.assertEqual((status, body, metadata['Content-Length']), (206, b'', '10'))
        for value in ('bytes=999999-', 'bytes=10-5', 'bytes=0-1,5-6', 'bytes=-0', 'garbage'):
            status, metadata, _ = self.request('GET', path, headers={'Range': value})
            self.assertEqual(status, 416)
            self.assertEqual(metadata['Content-Range'], f'bytes */{len(self.content)}')

    def test_catalog_private_unreferenced_and_traversal_resources_not_served(self):
        self.pair()
        (self.root / 'secret.txt').write_text('secret')
        for path in ('secret.txt', 'data/library/catalog.json', 'series/../secret.txt', '%2e%2e/secret.txt', 'series%5Cisla.mp4'):
            self.assertEqual(self.request('GET', '/api/files/' + path)[0], 404)

    def test_unsupported_write_methods_do_not_modify_catalog(self):
        self.pair()
        original = self.catalog.read_bytes()
        for method in ('POST', 'DELETE', 'PUT', 'PATCH'):
            self.assertEqual(self.request(method, '/api/catalog')[0], 405)
        self.assertEqual(self.catalog.read_bytes(), original)

    def test_origin_browser_and_public_host_are_rejected(self):
        self.pair()
        self.assertEqual(self.request('GET', '/api/catalog', headers={'Origin': 'http://evil.example'})[0], 403)
        self.assertEqual(self.request('GET', '/api/catalog', headers={'Host': 'evil.example:4184'})[0], 403)
        self.assertEqual(self.request('GET', '/api/catalog', headers={'Host': '8.8.8.8:4184'})[0], 403)
        self.assertEqual(self.request('GET', '/api/catalog', headers={'Host': 'localhost:4184'})[0], 403)

    def test_unpublished_resources_are_revoked_immediately(self):
        self.pair()
        self.record['status'] = 'draft'
        self.write_catalog([self.record])
        self.assertEqual(json.loads(self.request('GET', '/api/catalog')[2])['records'], [])
        self.assertEqual(self.request('GET', '/api/files/' + quote(self.relative, safe='/'))[0], 404)

    def test_changed_size_or_invalid_media_blocks_manifest(self):
        self.pair()
        (self.root / self.relative).write_bytes(self.content + b'change')
        self.assertEqual(self.request('GET', '/api/manifest')[0], 409)

    def test_hash_cache_invalidated_for_same_size_file_change(self):
        library = self.server.library
        original = library.manifest()['files'][-1]['sha256']
        changed = self.content[:-1] + b'X'
        (self.root / self.relative).write_bytes(changed)
        digest = library.manifest()['files'][-1]['sha256']
        self.assertNotEqual(original, digest)
        self.assertEqual(digest, hashlib.sha256(changed).hexdigest())

    def test_symlink_resource_is_rejected(self):
        path = self.root / self.relative
        path.unlink()
        outside = self.root.parent / (self.root.name + '-outside.mp4')
        outside.write_bytes(self.content)
        self.addCleanup(outside.unlink)
        try:
            path.symlink_to(outside)
        except OSError:
            self.skipTest('This Windows user cannot create symbolic links.')
        with self.assertRaises(ValueError):
            self.server.library.snapshot()

    def test_expired_tokens_and_changed_client_address_rejected(self):
        now = [100]
        pairing = SHARE.Pairing('123456', lambda: now[0])
        token = pairing.pair('192.168.1.5', '123456')['token']
        self.assertTrue(pairing.authorized('192.168.1.5', 'Bearer ' + token))
        self.assertFalse(pairing.authorized('192.168.1.6', 'Bearer ' + token))
        now[0] += 7201
        self.assertFalse(pairing.authorized('192.168.1.5', 'Bearer ' + token))

    def test_only_rfc1918_and_loopback_ipv4_allowed(self):
        for ip in ('10.5.4.3', '172.16.0.2', '172.31.1.4', '192.168.5.7', '127.0.0.1'):
            self.assertTrue(SHARE.private_address(ip))
        for ip in ('172.32.0.1', '8.8.8.8', '169.254.0.1', '::1', '192.0.2.1', 'not-ip'):
            self.assertFalse(SHARE.private_address(ip))

    def test_qr_landing_opens_app_with_exact_encoded_address_and_code(self):
        status, headers, body = self.request('GET', '/connect?code=123456', authenticated=False)
        self.assertEqual(status, 200)
        self.assertEqual(headers['Content-Type'], 'text/html; charset=utf-8')
        self.assertEqual(headers['Referrer-Policy'], 'no-referrer')
        self.assertIn(b'intent://connect?address=http%3A%2F%2F127.0.0.1%3A', body)
        self.assertIn(b'&amp;code=123456#Intent;scheme=netflixlocal;package=com.netflix.local;end', body)
        self.assertIn(b'netflixlocal://connect?address=', body)
        self.assertNotIn(b'La isla', body)
        self.assertEqual(len(self.server.pairing.tokens), 0)
        self.assertEqual(self.request('GET', '/api/catalog', authenticated=False)[0], 401)

    def test_wrong_qr_code_and_invalid_queries_reveal_neither_pin_nor_library(self):
        for path, expected in (('/connect?code=654321', 403), ('/connect', 400), ('/connect?code=123456&extra=1', 400), ('/connect?code=123456&code=123456', 400)):
            status, _, body = self.request('GET', path, authenticated=False)
            self.assertEqual(status, expected)
            self.assertNotIn(b'123456', body)
            self.assertNotIn(b'La isla', body)
            self.assertNotIn(b'intent:', body)
        self.assertEqual(self.request('GET', '/', authenticated=False)[0], 401)

    def test_qr_page_cannot_bypass_private_host_origin_checks(self):
        for headers in ({'Origin': 'https://evil.example'}, {'Host': 'evil.example:4184'}, {'Host': f'127.0.0.1:{self.server.server_port}/injected'}, {'Host': f'user@127.0.0.1:{self.server.server_port}'}):
            self.assertEqual(self.request('GET', '/connect?code=123456', authenticated=False, headers=headers)[0], 403)

    def test_qr_landing_bruteforce_is_rate_limited_without_issuing_tokens(self):
        for _ in range(6):
            self.assertEqual(self.request('GET', '/connect?code=654321', authenticated=False)[0], 403)
        self.assertEqual(self.request('GET', '/connect?code=123456', authenticated=False)[0], 429)
        self.assertEqual(len(self.server.pairing.tokens), 0)

    def test_offline_qr_page_encodes_each_private_connection_and_overwrites_previous_pin(self):
        payloads = []
        def fake_svg(value):
            payloads.append(value)
            return '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
        with patch.object(SHARE, 'qr_svg', side_effect=fake_svg):
            destination = SHARE.write_connection_qr(self.root, ['192.168.0.10', '10.0.0.4'], 4184, '123456')
            document = destination.read_text(encoding='utf-8')
            self.assertEqual(payloads, ['http://192.168.0.10:4184/connect?code=123456', 'http://10.0.0.4:4184/connect?code=123456'])
            self.assertEqual(document.count('<svg '), 2)
            self.assertIn('123456', document)
            self.assertNotIn('<script', document)
            self.assertNotIn('https://', document)
            SHARE.write_connection_qr(self.root, ['192.168.0.10'], 4184, '654321')
            self.assertNotIn('123456', destination.read_text(encoding='utf-8'))
        self.assertEqual(destination, self.root / 'output/wifi-connection/conectar.html')

    def test_real_offline_qr_svg_has_quiet_zone_and_crisp_module_path(self):
        svg = SHARE.qr_svg('http://192.168.0.10:4184/connect?code=123456')
        self.assertTrue(svg.startswith('<svg xmlns='))
        self.assertIn('shape-rendering="crispEdges"', svg)
        self.assertIn('fill="#fff"', svg)
        self.assertIn('fill="#000"', svg)
        self.assertIn('M4,4h1v1h-1z', svg)
        self.assertNotIn('<image', svg)
        self.assertNotIn('http://192.', svg)


if __name__ == '__main__':
    unittest.main()
