#!/usr/bin/env bash
# 仅为 daywish 建立独立静态服务，不修改宿主机的域名 Nginx 配置。
set -euo pipefail
cd "$(dirname "$0")"
command -v docker >/dev/null || { echo '服务器尚未安装 Docker，停止；不会自动安装。'; exit 1; }
DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
  sudo -n docker info >/dev/null 2>&1 || { echo '部署账号没有 Docker 权限或免密 sudo 权限。'; exit 1; }
  DOCKER=(sudo -n docker)
fi
"${DOCKER[@]}" compose version >/dev/null
python3 -c 'import sys; assert sys.version_info >= (3, 9), "需要 Python 3.9+"'
command -v flock >/dev/null || { echo '缺少 Linux flock 工具。'; exit 1; }
exec 9>/srv/daywish/.bootstrap.lock
flock -x 9
if command -v ss >/dev/null && ss -ltn '( sport = :8085 )' | tail -n +2 | grep -q .; then
  "${DOCKER[@]}" inspect daywish-website >/dev/null 2>&1 || { echo '8085 已被其他服务使用，停止。'; exit 1; }
fi
mkdir -p /srv/daywish/service /srv/daywish/state /srv/daywish/downloads
chmod 755 /srv/daywish /srv/daywish/state /srv/daywish/downloads /srv/daywish/service
python3 deploy.py init
cp nginx-site.conf compose.yml /srv/daywish/service/
"${DOCKER[@]}" compose -f /srv/daywish/service/compose.yml config --quiet
"${DOCKER[@]}" compose -f /srv/daywish/service/compose.yml run --rm --no-deps website nginx -t
"${DOCKER[@]}" compose -f /srv/daywish/service/compose.yml up -d --wait
# 服务就绪后才切换首页；内网构建标识不匹配时 deploy.py 会回滚。
python3 deploy.py site site.tgz --probe http://127.0.0.1:8085
if [[ -f package.bin && -f record.json ]]; then
  python3 deploy.py release package.bin record.json
fi
curl --fail --silent --show-error http://127.0.0.1:8085/healthz
echo '官网服务已启动：127.0.0.1:8085；宿主机域名配置未修改。'
