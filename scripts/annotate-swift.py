#!/usr/bin/env python3
"""把公开源码构建错误转成 GitHub 检查注释，便于定位云端 Swift 编译失败。"""
from pathlib import Path
import re
import sys

def escape(value):
    return value.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')

count = 0
for line in Path(sys.argv[1]).read_text(encoding='utf-8', errors='replace').splitlines():
    match = re.match(r'^(.*?\.swift):(\d+)(?::(\d+))?: (?:fatal )?error: (.*)$', line)
    if match:
        path, number, column, message = match.groups()
        normalized = path.replace('\\', '/')
        if '/macos/' in normalized:
            normalized = 'macos/' + normalized.split('/macos/', 1)[1]
        metadata = 'file=' + escape(normalized).replace(',', '%2C') + ',line=' + number
        if column:
            metadata += ',col=' + column
        print('::error ' + metadata + ',title=Swift 构建失败::' + escape(message))
        count += 1
    elif line.startswith('error:'):
        print('::error title=Swift 构建失败::' + escape(line))
        count += 1
    if count >= 30:
        break
