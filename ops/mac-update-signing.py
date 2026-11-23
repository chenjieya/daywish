#!/usr/bin/env python3
"""服务器保管 Mac 更新私钥；CI 只能取得公钥和指定更新包的签名。"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from deploy import deployment_lock


def openssl(*arguments):
    return subprocess.run(['openssl', *map(str, arguments)], check=True, capture_output=True).stdout


def public_key(root):
    manifest_path = root / 'state/releases.json'
    published = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {'releases': []}
    trusted = {record['publicKey'] for record in published['releases'] if record.get('platform') == 'macos' and record.get('publicKey')}
    directory = root / 'keys'
    directory.mkdir(exist_ok=True, mode=0o700)
    directory.chmod(0o700)
    key = directory / 'sparkle-ed25519.pem'
    if not key.exists():
        if trusted:
            raise ValueError('已发布的 Mac 更新私钥丢失，请恢复备份；禁止自动生成新密钥使旧客户端失去更新能力')
        temporary = directory / 'sparkle-ed25519.pem.tmp'
        try:
            openssl('genpkey', '-algorithm', 'ED25519', '-out', temporary)
            temporary.chmod(0o600)
            os.replace(temporary, key)
        finally:
            temporary.unlink(missing_ok=True)
    key.chmod(0o600)
    der = openssl('pkey', '-in', key, '-pubout', '-outform', 'DER')
    if len(der) != 44 or der[:12].hex() != '302a300506032b6570032100':
        raise ValueError('服务器更新密钥不是 Ed25519，禁止更换已发布公钥')
    public = base64.b64encode(der[12:]).decode('ascii')
    if trusted and trusted != {public}:
        raise ValueError('Mac 更新密钥与已发布公钥不一致，禁止隐式轮换')
    return public


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['public-key', 'sign'])
    parser.add_argument('archive', nargs='?')
    parser.add_argument('sha256', nargs='?')
    parser.add_argument('--root', default='/srv/daywish')
    args = parser.parse_args()
    root = Path(args.root).resolve()
    if root == Path(root.anchor):
        raise ValueError('无效签名目录')
    with deployment_lock(root):
        public = public_key(root)
        if args.command == 'public-key':
            print(public)
            return
        archive = Path(args.archive or '').resolve()
        if not archive.is_relative_to(root / 'incoming') or archive.suffix != '.zip' or not re.fullmatch('[0-9a-f]{64}', args.sha256 or ''):
            raise ValueError('只签名本项目暂存目录中已核对的 ZIP')
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        if digest != args.sha256:
            raise ValueError('待签名更新包 SHA-256 不符')
        signature = openssl('pkeyutl', '-sign', '-rawin', '-inkey', root / 'keys/sparkle-ed25519.pem', '-in', archive)
        if len(signature) != 64:
            raise ValueError('更新包签名长度不符')
        print(json.dumps({'publicKey': public, 'edSignature': base64.b64encode(signature).decode('ascii'), 'sha256': digest}))


if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError as error:
        message = error.stderr.decode('utf-8', errors='replace').strip().replace('%', '%25').replace('\n', '%0A').replace('\r', '%0D')
        print('::error title=Mac 更新签名失败::' + message, file=sys.stderr)
        raise SystemExit(1)
    except (ValueError, OSError) as error:
        print('::error title=Mac 更新签名失败::' + str(error), file=sys.stderr)
        raise SystemExit(1)
