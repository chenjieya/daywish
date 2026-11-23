#!/usr/bin/env python3
"""在 GitHub runner 解析官方 CDN 地址，避免服务器反复访问 GitHub 跳转入口。"""
import json
import os
from pathlib import Path
import sys
from urllib.request import Request, urlopen
from deploy import github_download_url, trusted_download_url, validate_record

record = validate_record(json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig')))
with urlopen(Request(github_download_url(record), headers={'User-Agent': 'Daywish-Official-Download', 'Range': 'bytes=0-0'}), timeout=30) as response:
    url = trusted_download_url(response.url)
Path(sys.argv[2]).write_text(url, encoding='utf-8')
os.chmod(sys.argv[2], 0o600)
print('已解析 GitHub 官方下载源，地址不写入日志或版本清单')
