"""Desktop connection controls expose only fixed launchers and live verified QR."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

SCRIPT = Path(__file__).resolve().parent.parent / 'scripts/connection_control.py'
SPEC = importlib.util.spec_from_file_location('connection_control_test', SCRIPT)
CONTROL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CONTROL)


class ConnectionControlTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.control = CONTROL.ConnectionControl(self.root)

    def page(self, code='123456'):
        path = self.root / 'output/wifi-connection/conectar.html'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f'<code>http://192.168.0.10:4184</code><div class="pin">{code}</div>', encoding='utf-8')
        return path

    def test_unknown_actions_arguments_and_arbitrary_scripts_rejected(self):
        with patch.object(CONTROL.subprocess, 'Popen') as launch:
            for data in ({}, None, [], {'action': 'execute'}, {'action': 'start_usb', 'serial': 'other'}, {'action': 'start_wifi', 'port': 9999}, {'action': 'status', 'root': 'C:'}, {'action': 'qr', 'address': 'http://8.8.8.8'}):
                with self.assertRaises(ValueError):
                    self.control.handle(data)
            launch.assert_not_called()

    def test_status_reads_devices_without_installing_launching_or_transferring(self):
        with patch.object(self.control, '_devices', return_value=([{'serial': 'abc', 'model': 'Redmi', 'state': 'device'}], [])), patch.object(CONTROL.subprocess, 'Popen') as launch:
            result = self.control.handle({'action': 'status'})
        self.assertEqual(result['devices'][0]['model'], 'Redmi')
        self.assertEqual(result['apk'], {'exists': False, 'size': 0})
        self.assertFalse(result['wifi']['running'])
        launch.assert_not_called()

    def test_adb_parse_reports_unauthorized_offline_and_connected_devices(self):
        output = 'List of devices attached\nabc device product:p model:Redmi_Note transport_id:1\noff offline\nask unauthorized\nmalformed unknown\n'
        with patch.object(CONTROL.Path, 'is_file', return_value=True), patch.object(CONTROL.subprocess, 'run', return_value=Mock(returncode=0, stdout=output)) as run:
            devices, messages = self.control._devices()
        self.assertEqual(devices, [{'serial': 'abc', 'model': 'Redmi Note', 'state': 'device'}, {'serial': 'off', 'model': 'off', 'state': 'offline'}, {'serial': 'ask', 'model': 'ask', 'state': 'unauthorized'}])
        self.assertEqual(messages, [])
        self.assertEqual(run.call_args_list[0].args[0][-2:], ['devices', '-l'])
        self.assertEqual(run.call_args_list[0].kwargs['timeout'], 3)
        self.assertEqual(run.call_args_list[1].args[0][-5:], ['-s', 'abc', 'shell', 'getprop', 'ro.product.marketname'])

    def test_usb_device_uses_readable_marketing_name(self):
        replies = [Mock(returncode=0, stdout='List of devices attached\nabc device model:24115RA8EG\n'),
                   Mock(returncode=0, stdout='Redmi Note 14 Pro+ 5G\n')]
        with patch.object(CONTROL.Path, 'is_file', return_value=True), patch.object(CONTROL.subprocess, 'run', side_effect=replies):
            devices, messages = self.control._devices()
        self.assertEqual(devices[0]['model'], 'Redmi Note 14 Pro+ 5G')
        self.assertEqual(messages, [])

    def test_adb_timeout_is_actionable_and_does_not_return_logs(self):
        with patch.object(CONTROL.Path, 'is_file', return_value=True), patch.object(CONTROL.subprocess, 'run', side_effect=subprocess.TimeoutExpired('adb', 3)):
            devices, messages = self.control._devices()
        self.assertEqual(devices, [])
        self.assertIn('depuración USB', messages[0])

    def test_apk_metadata_comes_from_local_file_and_manifest(self):
        (self.root / 'releases').mkdir()
        (self.root / 'releases/Netflix-Android.apk').write_bytes(b'apk')
        (self.root / 'android-local').mkdir()
        (self.root / 'android-local/AndroidManifest.xml').write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android" android:versionName="1.1.2"/>')
        self.assertEqual(self.control._apk(), {'exists': True, 'size': 3, 'version': '1.1.2'})

    def test_stale_qr_file_never_reports_active_server_or_exposes_code(self):
        self.page()
        with patch.object(CONTROL.SHARE, 'local_addresses', return_value=['192.168.0.10']), patch.object(self.control, '_verify_wifi', return_value=False):
            result = self.control._wifi()
        self.assertEqual(result, {'running': False, 'addresses': [], 'qrs': []})

    def test_verified_qr_only_for_present_private_interfaces(self):
        self.page()
        with patch.object(CONTROL.SHARE, 'local_addresses', return_value=['192.168.0.10']), patch.object(self.control, '_verify_wifi', return_value=True) as verify, patch('socket.create_connection', return_value=Mock(__enter__=Mock(), __exit__=Mock())):
            result = self.control._wifi()
            repeated = self.control._wifi()
        verify.assert_called_once_with('123456')
        self.assertTrue(result['running'])
        self.assertEqual(result['code'], '123456')
        self.assertEqual(result['addresses'], ['http://192.168.0.10:4184'])
        self.assertEqual(result['qrs'][0]['payload'], 'http://192.168.0.10:4184/connect?code=123456')
        self.assertIn('<svg', result['qrs'][0]['svg'])
        self.assertEqual(result, repeated)

    def test_disconnected_server_clears_proof_and_code_on_next_status(self):
        self.page()
        with patch.object(CONTROL.SHARE, 'local_addresses', return_value=['192.168.0.10']), patch.object(self.control, '_verify_wifi', return_value=True), patch('socket.create_connection', side_effect=OSError('closed')):
            result = self.control._wifi()
        self.assertFalse(result['running'])
        self.assertNotIn('code', result)
        self.assertIsNone(self.control.proof)

    def test_old_network_addresses_and_oversized_qr_files_do_not_get_presented(self):
        path = self.page()
        with patch.object(CONTROL.SHARE, 'local_addresses', return_value=['10.0.0.2']), patch.object(self.control, '_verify_wifi') as verify:
            self.assertFalse(self.control._wifi()['running'])
        verify.assert_not_called()
        path.write_bytes(b'x' * (CONTROL.MAX_QR_PAGE + 1))
        self.assertFalse(self.control._wifi()['running'])

    def test_wifi_start_only_invokes_fixed_launcher_and_not_twice_while_starting(self):
        status = {'devices': [], 'apk': {}, 'wifi': {'running': False}, 'messages': []}
        process = Mock()
        process.poll.return_value = None
        with patch.object(self.control, '_status', return_value=status), patch.object(self.control, '_launch', return_value=process) as launch:
            self.assertTrue(self.control.handle({'action': 'start_wifi'})['starting'])
            self.control.handle({'action': 'start_wifi'})
        launch.assert_called_once_with('Compartir-WiFi.bat')

    def test_already_running_wifi_returns_status_without_launch(self):
        status = {'wifi': {'running': True}}
        with patch.object(self.control, '_status', return_value=status), patch.object(self.control, '_launch') as launch:
            self.assertEqual(self.control.handle({'action': 'start_wifi'}), status)
        launch.assert_not_called()

    def test_usb_start_only_invokes_fixed_launcher_and_human_confirmation_remains_there(self):
        process = Mock()
        process.poll.return_value = None
        with patch.object(self.control, '_status', return_value={}), patch.object(self.control, '_launch', return_value=process) as launch:
            self.control.handle({'action': 'start_usb'})
            self.control.handle({'action': 'start_usb'})
        launch.assert_called_once_with('Conectar-USB.bat')

    def test_fixed_launcher_opens_console_in_root_without_command_from_request(self):
        (self.root / 'Conectar-USB.bat').write_text('@echo off')
        with patch.object(CONTROL.subprocess, 'Popen') as launch:
            self.control._launch('Conectar-USB.bat')
        command = launch.call_args.args[0]
        self.assertTrue(command.endswith(' ""' + str(self.root / 'Conectar-USB.bat') + '""'))
        self.assertEqual(launch.call_args.kwargs['cwd'], str(self.root))
        self.assertEqual(launch.call_args.kwargs['creationflags'], 0x10)

    def test_wifi_verification_checks_correct_code_html_and_no_redirect(self):
        response = Mock(status=200)
        response.read.return_value = b'netflixlocal://connect?address=anything&amp;code=123456'
        response.getheader.return_value = 'text/html; charset=utf-8'
        connection = Mock()
        connection.getresponse.return_value = response
        with patch.object(CONTROL.http.client, 'HTTPConnection', return_value=connection):
            self.assertTrue(self.control._verify_wifi('123456'))
            response.status = 302
            self.assertFalse(self.control._verify_wifi('123456'))
        connection.request.assert_called_with('GET', '/connect?code=123456')
        self.assertEqual(connection.close.call_count, 2)


if __name__ == '__main__':
    unittest.main()
