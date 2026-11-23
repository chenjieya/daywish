import io
import json
import hashlib
import importlib.util
import os
from pathlib import Path
import tarfile
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import URLError
from ops.deploy import checksum, publish_package, extract_site, publish_site, validate_record, initialize_manifest, deployment_lock

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'ops'))
spec = importlib.util.spec_from_file_location('download_package', Path(__file__).resolve().parents[1] / 'ops/download-package.py')
downloader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(downloader)


class DeployTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.payload = self.root / 'payload.exe'
        self.payload.write_bytes(b'MZ-package-content')
        self.record = dict(platform='windows', version='0.2.2', file='Daywish-0.2.2-Windows-x64-Setup.exe', bytes=self.payload.stat().st_size, sha256=checksum(self.payload), publishedAt='2026-11-23T08:00:00+08:00', notes=['test'])

    def test_bad_hash_does_not_change_manifest(self):
        with self.assertRaises(ValueError):
            publish_package(self.root, self.payload, {**self.record, 'sha256': '0' * 64})
        self.assertFalse((self.root / 'state/releases.json').exists())

    def test_parallel_ranges_retry_and_verify_entire_file(self):
        payload = b'content-for-package-' * 1000
        record = {**self.record, 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}
        attempts = {}
        lock = threading.Lock()
        class Response(io.BytesIO):
            status = 206
            url = 'https://release-assets.githubusercontent.com/test'
        def source(request, timeout):
            value = request.get_header('Range').removeprefix('bytes=')
            start, end = map(int, value.split('-'))
            with lock:
                attempts[value] = attempts.get(value, 0) + 1
                if start == 1024 and attempts[value] == 1:
                    raise TimeoutError('temporary failure')
            response = Response(payload[start:end + 1])
            response.headers = {'Content-Range': f'bytes {start}-{end}/{len(payload)}'}
            return response
        destination = self.root / 'verified.exe'
        with patch.object(downloader, 'urlopen', side_effect=source):
            downloader.download_ranges('https://github.com/test', destination, record, workers=4, chunk_size=1024)
        self.assertEqual(destination.read_bytes(), payload)
        self.assertEqual(attempts['1024-2047'], 2)

    def test_download_hash_mismatch_never_publishes_file(self):
        class Response(io.BytesIO):
            status = 206
            url = 'https://release-assets.githubusercontent.com/test'
        def source(request, timeout):
            start, end = map(int, request.get_header('Range').removeprefix('bytes=').split('-'))
            response = Response(b'x' * (end - start + 1))
            response.headers = {'Content-Range': f'bytes {start}-{end}/{self.record["bytes"]}'}
            return response
        destination = self.root / 'never.exe'
        with patch.object(downloader, 'urlopen', side_effect=source):
            with self.assertRaises(ValueError):
                downloader.download_ranges('https://github.com/test', destination, self.record, workers=2, chunk_size=8)
        self.assertFalse(destination.exists())

    def test_first_site_deploy_has_no_fake_download_and_keeps_existing_releases(self):
        initialize_manifest(self.root)
        state = self.root / 'state/releases.json'
        self.assertEqual(json.loads(state.read_text(encoding='utf-8'))['releases'], [])
        publish_package(self.root, self.payload, self.record)
        initialize_manifest(self.root)
        self.assertEqual(json.loads(state.read_text(encoding='utf-8'))['releases'], [self.record])

    def test_package_precedes_manifest_and_retry_is_idempotent(self):
        publish_package(self.root, self.payload, self.record)
        self.assertTrue((self.root / 'downloads' / self.record['file']).is_file())
        publish_package(self.root, self.payload, self.record)
        data = json.loads((self.root / 'state/releases.json').read_text(encoding='utf-8'))
        self.assertEqual(len(data['releases']), 1)

    def test_platforms_do_not_overwrite_each_other(self):
        publish_package(self.root, self.payload, self.record)
        mac = {**self.record, 'platform': 'macos', 'file': 'Daywish-0.2.2-macOS-arm64.zip'}
        publish_package(self.root, self.payload, mac)
        data = json.loads((self.root / 'state/releases.json').read_text(encoding='utf-8'))
        self.assertEqual(len(data['releases']), 2)

    def test_same_version_cannot_mutate(self):
        publish_package(self.root, self.payload, self.record)
        publish_package(self.root, self.payload, {**self.record, 'notes': ['changed']})
        data = json.loads((self.root / 'state/releases.json').read_text(encoding='utf-8'))
        self.assertEqual(data['releases'][0]['notes'], ['test'])
        self.payload.write_bytes(b'changed-package-content')
        with self.assertRaises(ValueError):
            publish_package(self.root, self.payload, {**self.record, 'bytes': self.payload.stat().st_size, 'sha256': checksum(self.payload)})

    def test_record_rejects_paths(self):
        with self.assertRaises(ValueError):
            validate_record({**self.record, 'file': '../outside.exe'})
        with self.assertRaises(ValueError):
            validate_record({**self.record, 'file': 'Daywish-9.0.0-Windows-x64-Setup.exe'})

    def test_tar_rejects_traversal_and_links(self):
        for name, link in [('../outside', False), ('link', True)]:
            archive = self.root / 'bad.tgz'
            with tarfile.open(archive, 'w:gz') as tar:
                info = tarfile.TarInfo(name)
                if link:
                    info.type = tarfile.SYMTYPE
                    info.linkname = '/etc/passwd'
                tar.addfile(info)
            with self.assertRaises(ValueError):
                extract_site(archive, self.root / 'target')

    @unittest.skipIf(os.name == 'nt', 'Windows 不保证非管理员创建符号链接；Linux CI 验证原子切换')
    def test_failed_probe_restores_previous_site(self):
        archive = self.root / 'site.tgz'
        with tarfile.open(archive, 'w:gz') as tar:
            for name, value in [('index.html', b'<html></html>'), ('build.json', b'{"commit":"abc"}')]:
                info = tarfile.TarInfo(name)
                info.size = len(value)
                tar.addfile(info, io.BytesIO(value))
        # TemporaryDirectory 在 Linux 默认是 700；使用与真实 CLI 一致的锁入口归一化权限。
        with deployment_lock(self.root):
            publish_site(self.root, archive, '')
            previous = os.readlink(self.root / 'current')
            with patch('ops.deploy.urlopen', side_effect=URLError('probe failed')):
                with self.assertRaises(URLError):
                    publish_site(self.root, archive, 'http://127.0.0.1:8085')
            self.assertEqual(os.readlink(self.root / 'current'), previous)


if __name__ == '__main__':
    unittest.main()
