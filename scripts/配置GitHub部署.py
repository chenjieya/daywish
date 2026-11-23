#!/usr/bin/env python3
"""一次性配置 GitHub Actions，私钥只在内存中加密后通过 HTTPS 发送。"""
import argparse
import base64
import json
import os
from pathlib import Path
import re
import subprocess
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def github_token():
    for name in ('GH_TOKEN', 'GITHUB_TOKEN'):
        if os.environ.get(name):
            return os.environ[name]
    environment = {**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GCM_INTERACTIVE': 'never'}
    result = subprocess.run(['git', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n', text=True, capture_output=True, env=environment, timeout=30)
    if result.returncode:
        raise RuntimeError('无法读取本机 GitHub 登录凭据，请在已登录 GitHub 的本人终端运行')
    fields = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
    if not fields.get('password'):
        raise RuntimeError('GitHub 登录凭据中缺少访问令牌')
    return fields['password']


def trusted_host(host, port):
    lookup = host if port == 22 else f'[{host}]:{port}'
    result = subprocess.run(['ssh-keygen', '-F', lookup], capture_output=True, text=True, timeout=10)
    lines = [line for line in result.stdout.splitlines() if line and not line.startswith('#')]
    if result.returncode or not lines:
        raise RuntimeError('本机 known_hosts 尚无该服务器的已信任记录，请先在本人终端确认主机公钥')
    return '\n'.join(lines) + '\n'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--key', default=str(Path.home() / '.ssh/nest_home_deploy'))
    parser.add_argument('--repo', default='chenjieya/daywish')
    parser.add_argument('--host', default='152.136.107.93')
    parser.add_argument('--user', default='alvis')
    parser.add_argument('--port', type=int, default=22)
    parser.add_argument('--check-access', action='store_true')
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', args.repo):
        raise ValueError('无效仓库地址')
    if args.host != '152.136.107.93' or args.user != 'alvis' or not 1 <= args.port <= 65535:
        raise ValueError('此配置入口仅用于已确认的 alvis 部署目标')
    private = None
    if not args.check_access:
        try:
            private = Path(args.key).read_bytes()
        except PermissionError as cause:
            raise RuntimeError('系统拒绝读取部署私钥；请在能读取该密钥的本人终端运行此配置工具') from cause
        if b'PRIVATE KEY' not in private:
            raise ValueError('指定文件不是 SSH 私钥')
    token = github_token()

    def api(method, endpoint, data=None):
        payload = None if data is None else json.dumps(data).encode('utf-8')
        request = Request('https://api.github.com/repos/' + args.repo + endpoint, data=payload, method=method, headers={
            'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
            'User-Agent': 'Daywish-Deployment-Setup', 'Content-Type': 'application/json',
        })
        with urlopen(request, timeout=30) as response:
            body = response.read()
        return json.loads(body) if body else None

    if args.check_access:
        result = api('GET', '/actions/secrets')
        try:
            environment_result = api('GET', '/environments/production/secrets')
        except HTTPError as error:
            if error.code != 404:
                raise
            environment_result = {'secrets': []}
        print(json.dumps({'repository': args.repo, 'repositorySecretNames': [s['name'] for s in result['secrets']], 'productionSecretNames': [s['name'] for s in environment_result['secrets']]}, ensure_ascii=False))
        return
    # 复用本机已有 PyNaCl，不增加网站、客户端或 CI 运行依赖。
    try:
        from nacl.public import PublicKey, SealedBox
    except ImportError as cause:
        raise RuntimeError('此本机配置工具需要 PyNaCl；当前未安装，不会自动安装。也可在 GitHub Settings 手动配置 Secrets。') from cause
    known = trusted_host(args.host, args.port)
    try:
        api('GET', '/environments/production')
    except HTTPError as error:
        if error.code != 404:
            raise
        api('PUT', '/environments/production', {})
    public = api('GET', '/environments/production/secrets/public-key')
    sealed = SealedBox(PublicKey(base64.b64decode(public['key'])))
    for name, value in [('DEPLOY_SSH_KEY', private), ('DEPLOY_KNOWN_HOSTS', known.encode('utf-8'))]:
        encrypted = base64.b64encode(sealed.encrypt(value)).decode('ascii')
        api('PUT', '/environments/production/secrets/' + name, {'key_id': public['key_id'], 'encrypted_value': encrypted})
        print('已配置 GitHub production Secret：' + name)
    for name, value in [('DEPLOY_USER', args.user), ('DEPLOY_PORT', str(args.port))]:
        try:
            api('PATCH', '/environments/production/variables/' + name, {'name': name, 'value': value})
        except HTTPError as error:
            if error.code != 404:
                raise
            api('POST', '/environments/production/variables', {'name': name, 'value': value})
    api('POST', '/actions/workflows/website.yml/dispatches', {'ref': 'main'})
    print('已由 GitHub Actions 发起官网部署：https://github.com/' + args.repo + '/actions/workflows/website.yml')


if __name__ == '__main__':
    try:
        main()
    except HTTPError as error:
        raise SystemExit(f'GitHub API 请求失败，HTTP {error.code}；请检查登录凭据是否有仓库 Secrets 和工作流权限')
    except (RuntimeError, ValueError, OSError, subprocess.SubprocessError) as error:
        raise SystemExit(str(error))
