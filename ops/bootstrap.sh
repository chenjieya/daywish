#!/usr/bin/env bash
# 仅为 daywish 建立独立静态服务，不修改宿主机的域名 Nginx 配置。
set -euo pipefail
cd "$(dirname "$0")"
command -v docker >/dev/null || { echo '服务器尚未安装 Docker，停止；不会自动安装。'; exit 1; }
docker compose version >/dev/null
python3 -c 'import sys; assert sys.version_info >= (3, 9), "需要 Python 3.9+"'
if command -v ss >/dev/null && ss -ltn '( sport = :8085 )' | tail -n +2 | grep -q .; then
  docker inspect daywish-website >/dev/null 2>&1 || { echo '8085 已被其他服务使用，停止。'; exit 1; }
fi
mkdir -p /srv/daywish/service /srv/daywish/state /srv/daywish/downloads
chmod 755 /srv/daywish /srv/daywish/state /srv/daywish/downloads /srv/daywish/service
python3 deploy.py release package.bin record.json
python3 deploy.py site site.tgz
cp nginx-site.conf compose.yml /srv/daywish/service/
docker compose -f /srv/daywish/service/compose.yml up -d --wait
curl --fail --silent --show-error http://127.0.0.1:8085/healthz
echo '官网服务已启动：127.0.0.1:8085；宿主机域名配置未修改。'
