#!/usr/bin/env bash
# 仅为 daywish 建立独立静态服务，不修改宿主机的域名 Nginx 配置。
set -euo pipefail
STAGE='检查服务器环境'
trap 'code=$?; printf "::error title=官网初始化失败::%s失败，退出码 %s\n" "$STAGE" "$code"; exit "$code"' ERR
fail() { printf '::error title=官网初始化失败::%s\n' "$1"; exit 1; }
cd "$(dirname "$0")"
command -v docker >/dev/null || fail '服务器尚未安装 Docker，停止；不会自动安装。'
DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
  sudo -n docker info >/dev/null 2>&1 || fail 'alvis 没有 Docker 权限或免密 sudo Docker 权限。'
  DOCKER=(sudo -n docker)
fi
"${DOCKER[@]}" compose version >/dev/null
python3 -c 'import sys; assert sys.version_info >= (3, 9), "需要 Python 3.9+"'
command -v flock >/dev/null || fail '缺少 Linux flock 工具。'
exec 9>/srv/daywish/.bootstrap.lock
flock -x 9
if command -v ss >/dev/null && ss -ltn '( sport = :8085 )' | tail -n +2 | grep -q .; then
  "${DOCKER[@]}" inspect daywish-website >/dev/null 2>&1 || fail '8085 已被其他服务使用，停止。'
fi
mkdir -p /srv/daywish/service /srv/daywish/state /srv/daywish/downloads
chmod 755 /srv/daywish /srv/daywish/state /srv/daywish/downloads /srv/daywish/service
python3 deploy.py init
cp nginx-site.conf compose.yml /srv/daywish/service/
STAGE='校验官网容器配置和镜像'
"${DOCKER[@]}" compose -f /srv/daywish/service/compose.yml config --quiet
"${DOCKER[@]}" compose -f /srv/daywish/service/compose.yml run --rm --no-deps website nginx -t
STAGE='启动官网容器'
"${DOCKER[@]}" compose -f /srv/daywish/service/compose.yml up -d --wait
STAGE='重载官网容器路由配置'
# 已运行的容器不会因绑定配置文件内容变化自动重建，需显式平滑重载新增更新源路由。
"${DOCKER[@]}" compose -f /srv/daywish/service/compose.yml exec -T website nginx -t
"${DOCKER[@]}" compose -f /srv/daywish/service/compose.yml exec -T website nginx -s reload
# 服务就绪后才切换首页；内网构建标识不匹配时 deploy.py 会回滚。
STAGE='切换并验证官网静态文件'
python3 deploy.py site site.tgz --probe http://127.0.0.1:8085
if [[ -f package.bin && -f record.json ]]; then
  STAGE='校验并发布安装包'
  python3 deploy.py release package.bin record.json
fi
curl --fail --silent --show-error http://127.0.0.1:8085/healthz
echo '官网服务已启动：127.0.0.1:8085；宿主机域名配置未修改。'
