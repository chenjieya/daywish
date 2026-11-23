#!/usr/bin/env python3
"""在 GitHub runner 验证公开官网与本次构建一致，下载清单指向真实文件。"""
import argparse
import hashlib
import json
import re
import sys
import tarfile
import xml.etree.ElementTree as ET
from urllib.request import Request, urlopen
from deploy import validate_record

def report_error(kind, value, trace):
    message = str(value).replace('%', '%25').replace('\n', '%0A').replace('\r', '%0D')
    print('::error title=官网公网校验失败::' + message, flush=True)
    sys.__excepthook__(kind, value, trace)

sys.excepthook = report_error

parser = argparse.ArgumentParser()
parser.add_argument('archive')
args = parser.parse_args()
base = 'https://daywish.alvis.org.cn'
with tarfile.open(args.archive, 'r:gz') as bundle:
    files = {m.name.removeprefix('./'): m for m in bundle.getmembers() if m.isfile()}
    expected_build = json.loads(bundle.extractfile(files['build.json']).read())
    nonce = expected_build['builtAt']

    def fetch(path, method='GET'):
        request = Request(base + path + '?verify=' + nonce, method=method, headers={'User-Agent': 'Daywish-CI-Verification', 'Cache-Control': 'no-cache'})
        return urlopen(request, timeout=20)

    with fetch('/build.json') as response:
        if json.load(response) != expected_build:
            raise ValueError('公网构建标识与本次构建不符')
    with fetch('/') as response:
        html = response.read()
    if hashlib.sha256(html).digest() != hashlib.sha256(bundle.extractfile(files['index.html']).read()).digest():
        raise ValueError('公网首页与本次构建不一致')
    assets = re.findall(r'(?:src|href)="(/assets/[^"?#]+)"', html.decode('utf-8'))
    if not assets:
        raise ValueError('首页缺少静态资源')
    for asset in assets:
        with fetch(asset) as response:
            actual = response.read()
        expected = bundle.extractfile(files[asset.lstrip('/')]).read()
        if hashlib.sha256(actual).digest() != hashlib.sha256(expected).digest():
            raise ValueError('公网静态资源校验不符')
with fetch('/releases.json') as response:
    manifest = json.load(response)
if manifest.get('schema') != 1 or not isinstance(manifest.get('releases'), list):
    raise ValueError('公网版本清单无效')
versions = []
for record in manifest['releases']:
    validate_record(record)
    request = Request(record['downloadUrl'], method='HEAD', headers={'User-Agent': 'Daywish-CI-Verification'}) if record.get('downloadUrl') else None
    with (urlopen(request, timeout=30) if request else fetch('/downloads/' + record['file'], 'HEAD')) as response:
        if int(response.headers.get('Content-Length', 0)) != record['bytes']:
            raise ValueError('公网安装包大小不符')
    versions.append(record['platform'] + ' v' + record['version'])
latest_windows = sorted((record for record in manifest['releases'] if record['platform'] == 'windows' and 'sha512' in record), key=lambda record: tuple(map(int, record['version'].split('.'))), reverse=True)
if latest_windows:
    with fetch('/updates/windows/latest.yml') as response:
        feed = json.load(response)
    latest = latest_windows[0]
    if feed['version'] != latest['version'] or feed['files'][0]['sha512'] != latest['sha512']:
        raise ValueError('Windows 更新源与实际发布不一致')
if any(record.get('edSignature') for record in manifest['releases'] if record['platform'] == 'macos'):
    with fetch('/updates/macos/appcast.xml') as response:
        feed = ET.fromstring(response.read())
    for item in feed.findall('./channel/item'):
        version = item.findtext('{http://www.andymatuschak.org/xml-namespaces/sparkle}version')
        record = next(record for record in manifest['releases'] if record['platform'] == 'macos' and record['version'] == version)
        if item.find('enclosure').attrib['{http://www.andymatuschak.org/xml-namespaces/sparkle}edSignature'] != record['edSignature']:
            raise ValueError('Mac 更新源签名与发布记录不一致')
        if item.findtext('{http://www.andymatuschak.org/xml-namespaces/sparkle}minimumSystemVersion') != record.get('minimumSystemVersion', '26.0'):
            raise ValueError('Mac 更新源最低系统要求与实际发布不一致')
print('::notice title=官网公网验证通过::首页、构建标识、静态资源哈希已匹配；可下载版本：' + ('，'.join(versions) or '暂无，等待首次客户端发布'))
