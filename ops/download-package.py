#!/usr/bin/env python3
"""服务器从本项目 GitHub Release 拉取安装包，校验后才交给发布逻辑。"""
import json
import os
from pathlib import Path
import sys
import time
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen
from deploy import checksum, validate_record

record = validate_record(json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig')))
destination = Path(sys.argv[2])
partial = destination.with_name(destination.name + '.part')
tag = record.get('sourceTag', record['platform'] + '-v' + record['version'])
if not isinstance(tag, str) or not tag or len(tag) > 200:
    raise ValueError('无效 GitHub Release 标签')
url = 'https://github.com/chenjieya/daywish/releases/download/' + quote(tag, safe='') + '/' + record['file']
try:
    started = time.monotonic()
    with urlopen(Request(url, headers={'User-Agent': 'Daywish-Official-Download'}), timeout=30) as response:
        if urlparse(response.url).scheme != 'https':
            raise ValueError('禁止降级为非 HTTPS 下载')
        size = 0
        with partial.open('wb') as output:
            while True:
                chunk = response.read(256 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > record['bytes'] or time.monotonic() - started > 900:
                    raise ValueError('下载超出预期大小或最长时间')
                output.write(chunk)
    if size != record['bytes'] or checksum(partial) != record['sha256']:
        raise ValueError('GitHub 安装包大小或 SHA-256 不符')
    os.replace(partial, destination)
    print('::notice title=官方安装包已验证::HTTPS 下载完成，大小 ' + str(size) + ' 字节，SHA-256 与发布记录一致')
except Exception as error:
    partial.unlink(missing_ok=True)
    reason = type(error).__name__ + ((' HTTP ' + str(error.code)) if hasattr(error, 'code') else '')
    print('::error title=官方安装包下载失败::服务器无法完成 GitHub 官方 HTTPS 下载或校验：' + reason)
    raise
