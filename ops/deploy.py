#!/usr/bin/env python3
"""官网静态产物与安装包发布；只使用 Python 标准库，版本切换保留回滚目录。"""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import tarfile
import tempfile
from urllib.request import urlopen


def validate_record(record):
    if not isinstance(record, dict) or record.get('platform') not in ('windows', 'macos'):
        raise ValueError('无效平台')
    if not re.fullmatch(r'\d+\.\d+\.\d+', str(record.get('version', ''))):
        raise ValueError('无效版本号')
    name = record.get('file', '')
    if not isinstance(name, str) or not re.fullmatch(r'Daywish-[A-Za-z0-9.-]+\.(exe|zip)', name):
        raise ValueError('无效安装包文件名')
    if not name.startswith('Daywish-' + record['version'] + '-'):
        raise ValueError('文件名与版本号不匹配')
    if not name.endswith('.exe' if record['platform'] == 'windows' else '.zip'):
        raise ValueError('平台与扩展名不匹配')
    if not re.fullmatch(r'[0-9a-f]{64}', str(record.get('sha256', ''))):
        raise ValueError('无效校验值')
    if type(record.get('bytes')) is not int or record['bytes'] <= 0:
        raise ValueError('无效文件大小')
    stamp = datetime.fromisoformat(str(record.get('publishedAt', '')).replace('Z', '+00:00'))
    if stamp.tzinfo is None:
        raise ValueError('发布时间缺少时区')
    if not isinstance(record.get('notes'), list) or not all(isinstance(n, str) for n in record['notes']):
        raise ValueError('无效更新说明')
    return record


def checksum(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.chmod(0o644)
    os.replace(temporary, path)


@contextmanager
def deployment_lock(root):
    # Linux 发布端使用 flock，避免官网和双平台安装包同时发布时互相覆盖。
    root.mkdir(parents=True, exist_ok=True, mode=0o755)
    root.chmod(0o755)
    with (root / '.deploy.lock').open('a') as lock:
        if os.name != 'nt':
            import fcntl
            fcntl.flock(lock, fcntl.LOCK_EX)
        yield


def publish_package(root, package, record):
    record = validate_record(record)
    package = Path(package)
    if package.stat().st_size != record['bytes'] or checksum(package) != record['sha256']:
        raise ValueError('安装包大小或 SHA-256 不符，禁止更新下载信息')
    destination = root / 'downloads' / record['file']
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
    destination.parent.chmod(0o755)
    if destination.exists():
        if checksum(destination) != record['sha256']:
            raise ValueError('同名安装包已存在且内容不同，必须增加版本号')
    else:
        with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as stream:
            temporary = Path(stream.name)
        try:
            shutil.copyfile(package, temporary)
            temporary.chmod(0o644)
            os.replace(temporary, destination)
        finally:
            temporary.unlink(missing_ok=True)
    manifest_path = root / 'state/releases.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {'schema': 1, 'releases': []}
    if manifest.get('schema') != 1 or not isinstance(manifest.get('releases'), list):
        raise ValueError('现有版本清单无效')
    for prior in manifest['releases']:
        validate_record(prior)
        if prior['platform'] == record['platform'] and prior['version'] == record['version']:
            if any(prior[field] != record[field] for field in ('file', 'sha256', 'bytes')):
                raise ValueError('相同平台版本已发布，禁止改写安装包')
            # 重试或手动补发 GitHub Release 时保留第一次发布时间与说明。
            return
    # 先落安装包，再原子替换清单；官网不出现指向未上传文件的链接。
    manifest['releases'].append(record)
    atomic_json(manifest_path, manifest)
    manifest_path.parent.chmod(0o755)


def extract_site(archive, target):
    with tarfile.open(archive, 'r:gz') as bundle:
        members = bundle.getmembers()
        for member in members:
            relative = PurePosixPath(member.name)
            if relative.is_absolute() or '..' in relative.parts or '\\' in member.name or not (member.isdir() or member.isfile()):
                raise ValueError('站点包包含危险路径或链接')
            if not (target / member.name).resolve().is_relative_to(target.resolve()):
                raise ValueError('站点路径越界')
        bundle.extractall(target, members=members)
    if not (target / 'index.html').is_file() or not (target / 'build.json').is_file():
        raise ValueError('缺少首页或构建标识')
    for entry in target.rglob('*'):
        entry.chmod(0o755 if entry.is_dir() else 0o644)
    target.chmod(0o755)


def switch_link(root, target):
    temporary = root / 'current.next'
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(target, target_is_directory=True)
    os.replace(temporary, root / 'current')


def publish_site(root, archive, probe):
    current = root / 'current'
    if current.exists() and not current.is_symlink():
        raise ValueError('current 不是本流程创建的符号链接，拒绝覆盖')
    previous = os.readlink(current) if current.is_symlink() else None
    releases = root / 'sites'
    releases.mkdir(exist_ok=True, mode=0o755)
    releases.chmod(0o755)
    target = Path(tempfile.mkdtemp(prefix=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S-'), dir=releases))
    extract_site(archive, target)
    # 确认 Nginx 能穿越所有父目录。
    if any(not (parent.stat().st_mode & 0o001) for parent in [root, releases, target]):
        raise ValueError('站点父目录缺少可穿越权限')
    switch_link(root, target.relative_to(root))
    if previous:
        atomic_json(root / 'state/previous-site.json', {'target': previous})
    if probe:
        try:
            expected = json.loads((target / 'build.json').read_text(encoding='utf-8'))
            with urlopen(probe.rstrip('/') + '/build.json?verify=' + target.name, timeout=15) as response:
                actual = json.load(response)
            if actual != expected:
                raise ValueError('上线后构建标识不匹配')
        except Exception:
            if previous:
                switch_link(root, previous)
            else:
                current.unlink(missing_ok=True)
            raise
    return target.name


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', default='/srv/daywish')
    commands = parser.add_subparsers(dest='command', required=True)
    site = commands.add_parser('site')
    site.add_argument('archive')
    site.add_argument('--probe', default='')
    release = commands.add_parser('release')
    release.add_argument('package')
    release.add_argument('record')
    commands.add_parser('rollback-site')
    args = parser.parse_args()
    root = Path(args.root).resolve()
    if root == Path(root.anchor):
        raise ValueError('禁止使用文件系统根目录')
    with deployment_lock(root):
        if args.command == 'site':
            print('站点已切换：' + publish_site(root, args.archive, args.probe))
        elif args.command == 'release':
            publish_package(root, args.package, json.loads(Path(args.record).read_text(encoding='utf-8-sig')))
            print('安装包与版本清单已发布')
        else:
            previous = json.loads((root / 'state/previous-site.json').read_text(encoding='utf-8'))['target']
            destination = (root / previous).resolve()
            if not destination.is_relative_to(root / 'sites') or not destination.is_dir():
                raise ValueError('回滚目标无效')
            switch_link(root, previous)
            print('已回滚至上一站点')


if __name__ == '__main__':
    main()
