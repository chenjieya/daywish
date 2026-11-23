import base64
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from ops.deploy import publish_release_link, publish_update_feeds, validate_record

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'ops'))
spec = importlib.util.spec_from_file_location('mac_signing', Path(__file__).resolve().parents[1] / 'ops/mac-update-signing.py')
signing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(signing)


class UpdateFeedsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.record = dict(platform='windows', version='0.3.0', file='Daywish-0.3.0-Windows-x64-Setup.exe', bytes=200, sha256='a' * 64, sha512=base64.b64encode(b'x' * 64).decode(), publishedAt='2026-11-23T10:00:00Z', notes=['保留个人设置'])

    def test_feed_uses_highest_version_and_preserves_other_platform(self):
        publish_release_link(self.root, {**self.record, 'version': '0.10.0', 'file': 'Daywish-0.10.0-Windows-x64-Setup.exe'})
        publish_release_link(self.root, self.record)
        mac = {**self.record, 'platform': 'macos', 'file': 'Daywish-0.3.0-macOS-arm64.zip', 'edSignature': base64.b64encode(b's' * 64).decode(), 'publicKey': base64.b64encode(b'p' * 32).decode()}
        publish_release_link(self.root, mac)
        publish_update_feeds(self.root)
        feed = json.loads((self.root / 'state/updates/windows/latest.yml').read_text(encoding='utf-8'))
        self.assertEqual(feed['version'], '0.10.0')
        self.assertTrue(feed['files'][0]['url'].startswith('https://github.com/chenjieya/daywish/'))
        xml = ET.parse(self.root / 'state/updates/macos/appcast.xml')
        enclosure = xml.find('./channel/item/enclosure')
        self.assertEqual(enclosure.attrib['{http://www.andymatuschak.org/xml-namespaces/sparkle}edSignature'], mac['edSignature'])
        self.assertEqual(enclosure.attrib['length'], '200')

    def test_legacy_release_does_not_offer_unverified_update(self):
        old = {key: value for key, value in self.record.items() if key != 'sha512'}
        publish_release_link(self.root, old)
        publish_update_feeds(self.root)
        self.assertFalse((self.root / 'state/updates').exists())

    def test_malformed_signature_and_hash_rejected(self):
        for change in [{'sha512': 'bad'}, {'edSignature': 'bad', 'publicKey': 'bad'}, {'edSignature': base64.b64encode(b's' * 64).decode()}]:
            with self.assertRaises(ValueError):
                validate_record({**self.record, **change})

    @unittest.skipUnless(shutil.which('openssl'), '本机没有 OpenSSL；Linux CI 执行签名检查')
    def test_server_key_is_stable_and_signature_verifies(self):
        public = signing.public_key(self.root)
        self.assertEqual(signing.public_key(self.root), public)
        archive = self.root / 'update.zip'
        archive.write_bytes(b'mac-update-test')
        key = self.root / 'keys/sparkle-ed25519.pem'
        signature = signing.openssl('pkeyutl', '-sign', '-rawin', '-inkey', key, '-in', archive)
        sig = self.root / 'signature'
        sig.write_bytes(signature)
        der = self.root / 'public.der'
        der.write_bytes(bytes.fromhex('302a300506032b6570032100') + base64.b64decode(public))
        result = subprocess.run(['openssl', 'pkeyutl', '-verify', '-rawin', '-pubin', '-keyform', 'DER', '-inkey', str(der), '-sigfile', str(sig), '-in', str(archive)], capture_output=True)
        self.assertEqual(result.returncode, 0)
        archive.write_bytes(b'tampered')
        result = subprocess.run(['openssl', 'pkeyutl', '-verify', '-rawin', '-pubin', '-keyform', 'DER', '-inkey', str(der), '-sigfile', str(sig), '-in', str(archive)], capture_output=True)
        self.assertNotEqual(result.returncode, 0)

    @unittest.skipUnless(shutil.which('openssl'), '本机没有 OpenSSL')
    def test_missing_published_key_cannot_be_silently_rotated(self):
        public = signing.public_key(self.root)
        state = self.root / 'state'
        state.mkdir()
        (state / 'releases.json').write_text(json.dumps({'releases': [{'platform': 'macos', 'publicKey': public}]}), encoding='utf-8')
        key = self.root / 'keys/sparkle-ed25519.pem'
        key.unlink()
        with self.assertRaisesRegex(ValueError, '私钥丢失'):
            signing.public_key(self.root)
        self.assertFalse(key.exists())


if __name__ == '__main__':
    unittest.main()
