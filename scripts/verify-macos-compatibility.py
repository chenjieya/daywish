#!/usr/bin/env python3
"""核对应用声明及包内所有 Mach-O 的最低系统要求，避免只改 Info.plist。"""
from pathlib import Path
import plistlib
import re
import subprocess
import sys


MAGIC = {bytes.fromhex(value) for value in ['feedface', 'cefaedfe', 'feedfacf', 'cffaedfe', 'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca']}


def version(value):
    if not re.fullmatch(r'\d+\.\d+(?:\.\d+)?', value):
        raise ValueError('无效系统版本：' + value)
    parts = tuple(map(int, value.split('.')))
    return parts + (0,) * (3 - len(parts))


def deployment_versions(output):
    """兼容旧 LC_VERSION_MIN_MACOSX 和新 LC_BUILD_VERSION，包括多架构产物。"""
    versions = []
    for command in re.split(r'(?m)^Load command \d+\s*$', output):
        if re.search(r'\bcmd LC_BUILD_VERSION\b', command):
            match = re.search(r'\bminos (\d+\.\d+(?:\.\d+)?)', command)
        elif re.search(r'\bcmd LC_VERSION_MIN_MACOSX\b', command):
            match = re.search(r'\bversion (\d+\.\d+(?:\.\d+)?)', command)
        else:
            continue
        if match is None:
            raise ValueError('Mach-O 最低系统要求缺失')
        versions.append(match.group(1))
    if not versions:
        raise ValueError('Mach-O 未包含最低系统要求')
    return versions


def verify_bundle(app):
    with (app / 'Contents/Info.plist').open('rb') as stream:
        info = plistlib.load(stream)
    required = info['LSMinimumSystemVersion']
    if version(required) != version('12.0'):
        raise ValueError('本版应用必须声明支持 macOS 12.0')
    checked = set()
    for path in (app / 'Contents').rglob('*'):
        if not path.is_file() or path.resolve() in checked:
            continue
        with path.open('rb') as stream:
            if stream.read(4) not in MAGIC:
                continue
        checked.add(path.resolve())
        output = subprocess.check_output(['otool', '-l', str(path)], text=True)
        minimums = deployment_versions(output)
        if any(version(value) > version(required) for value in minimums):
            raise ValueError(f'{path.relative_to(app)} 需要 macOS {minimums}，超过 {required}')
        print(f'兼容检查：{path.relative_to(app)} 最低 macOS {", ".join(minimums)}')
    if not checked:
        raise ValueError('应用包内没有可验证的 Mach-O')
    print(f'MACOS_COMPATIBILITY_OK: {len(checked)} binaries support macOS {required}')


if __name__ == '__main__':
    verify_bundle(Path(sys.argv[1]))
