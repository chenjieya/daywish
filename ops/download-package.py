#!/usr/bin/env python3
"""从本项目官方 Release 分段拉取安装包；完整校验后才发布。"""
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import threading
import time
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen
from deploy import atomic_json, checksum, validate_record


def download_ranges(url, destination, record, workers=24, chunk_size=512 * 1024, retries=5):
    """每段独立重试，校验 Content-Range，最终 SHA-256 一致才原子落盘。"""
    destination = Path(destination)
    partial = destination.with_name(destination.name + '.part')
    progress = destination.with_name('download-progress.json')
    deadline = time.monotonic() + 900
    cancelled = threading.Event()
    atomic_json(progress, {'received': 0, 'expected': record['bytes'], 'status': 'downloading'})
    try:
        with urlopen(Request(url, headers={'User-Agent': 'Daywish-Official-Download', 'Range': 'bytes=0-0'}), timeout=30) as response:
            if urlparse(response.url).scheme != 'https' or response.status != 206 or response.headers.get('Content-Range') != f"bytes 0-0/{record['bytes']}":
                raise ValueError('官方源没有返回预期的 HTTPS 分段响应')
            direct_url = response.url
        with tempfile.TemporaryDirectory(prefix='download-', dir=destination.parent) as temporary:
            chunks = [(start, min(start + chunk_size, record['bytes']) - 1) for start in range(0, record['bytes'], chunk_size)]

            def fetch_chunk(index, start, end):
                target = Path(temporary) / str(index)
                for attempt in range(retries):
                    if cancelled.is_set() or time.monotonic() > deadline:
                        raise TimeoutError('下载已取消或超过最长时间')
                    try:
                        request = Request(direct_url, headers={'User-Agent': 'Daywish-Official-Download', 'Range': f'bytes={start}-{end}'})
                        with urlopen(request, timeout=25) as response:
                            if response.status != 206 or response.headers.get('Content-Range') != f"bytes {start}-{end}/{record['bytes']}":
                                raise ValueError('分段范围与官方响应不一致')
                            size = 0
                            with target.open('wb') as output:
                                while True:
                                    if cancelled.is_set() or time.monotonic() > deadline:
                                        raise TimeoutError('下载已取消或超过最长时间')
                                    block = response.read(64 * 1024)
                                    if not block:
                                        break
                                    size += len(block)
                                    if size > end - start + 1:
                                        raise ValueError('分段超出预期大小')
                                    output.write(block)
                            if size != end - start + 1:
                                raise ValueError('分段内容不完整')
                        return size
                    except Exception:
                        target.unlink(missing_ok=True)
                        if attempt == retries - 1 or cancelled.is_set():
                            raise
                        time.sleep(min(0.5 * (attempt + 1), 3))

            received = 0
            with ThreadPoolExecutor(max_workers=workers) as pool:
                futures = [pool.submit(fetch_chunk, index, start, end) for index, (start, end) in enumerate(chunks)]
                try:
                    for future in as_completed(futures):
                        received += future.result()
                        atomic_json(progress, {'received': received, 'expected': record['bytes'], 'status': 'downloading'})
                except Exception:
                    cancelled.set()
                    for future in futures:
                        future.cancel()
                    raise
            with partial.open('wb') as output:
                for index in range(len(chunks)):
                    with (Path(temporary) / str(index)).open('rb') as source:
                        shutil.copyfileobj(source, output)
        if partial.stat().st_size != record['bytes'] or checksum(partial) != record['sha256']:
            raise ValueError('GitHub 安装包大小或 SHA-256 不符')
        os.replace(partial, destination)
        atomic_json(progress, {'received': record['bytes'], 'expected': record['bytes'], 'status': 'verified'})
    except Exception:
        partial.unlink(missing_ok=True)
        atomic_json(progress, {'received': 0, 'expected': record['bytes'], 'status': 'failed'})
        raise


def main():
    record = validate_record(json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig')))
    tag = record.get('sourceTag', record['platform'] + '-v' + record['version'])
    if not isinstance(tag, str) or not tag or len(tag) > 200:
        raise ValueError('无效 GitHub Release 标签')
    url = 'https://github.com/chenjieya/daywish/releases/download/' + quote(tag, safe='') + '/' + record['file']
    try:
        download_ranges(url, sys.argv[2], record)
    except Exception as error:
        reason = type(error).__name__ + ((' HTTP ' + str(error.code)) if hasattr(error, 'code') else '')
        print('::error title=官方安装包下载失败::服务器无法完成 GitHub 官方 HTTPS 下载或校验：' + reason)
        raise
    print('::notice title=官方安装包已验证::HTTPS 分段下载完成，大小 ' + str(record['bytes']) + ' 字节，SHA-256 与发布记录一致')


if __name__ == '__main__':
    main()
