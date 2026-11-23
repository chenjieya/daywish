#!/usr/bin/env bash
# GitHub Actions 共用上传入口；凭据只通过环境变量和临时文件传入。
set -euo pipefail
MODE="${1:?site 或 release}"
PAYLOAD="${2:?产物路径}"
RECORD="${3:-}"
SITE_PAYLOAD="${4:-}"
HOST="${DEPLOY_HOST:-152.136.107.93}"
PORT="${DEPLOY_PORT:-22}"
USER_NAME="${DEPLOY_USER:?请设置仓库变量 DEPLOY_USER}"
[[ "$HOST" =~ ^[A-Za-z0-9.-]+$ && "$USER_NAME" =~ ^[A-Za-z0-9_-]+$ && "$PORT" =~ ^[0-9]+$ ]] || exit 2
: "${DEPLOY_SSH_KEY:?请先配置仓库 Secret DEPLOY_SSH_KEY}"
: "${DEPLOY_KNOWN_HOSTS:?请先配置仓库 Secret DEPLOY_KNOWN_HOSTS}"
[[ "$MODE" == site || "$MODE" == release ]] || exit 2
[[ -f "$PAYLOAD" ]] || exit 2
TMP="$(mktemp -d)"
trap 'rm -rf -- "$TMP"' EXIT
umask 077
printf '%s\n' "$DEPLOY_SSH_KEY" > "$TMP/key"
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$TMP/known_hosts"
SSH=(ssh -i "$TMP/key" -p "$PORT" -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$TMP/known_hosts")
SCP=(scp -i "$TMP/key" -P "$PORT" -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$TMP/known_hosts")
REMOTE="$USER_NAME@$HOST"
UPLOAD="$("${SSH[@]}" "$REMOTE" 'if [ ! -d /srv/daywish ]; then sudo -n install -d -m 755 -o "$(id -un)" -g "$(id -gn)" /srv/daywish; fi; test -w /srv/daywish || { echo "::error title=部署目录无权限::alvis 无法创建或写入 /srv/daywish，请授权该目录或免密 sudo" >&2; exit 1; }; mkdir -p /srv/daywish/incoming && mktemp -d /srv/daywish/incoming/upload.XXXXXXXX')"
[[ "$UPLOAD" =~ ^/srv/daywish/incoming/upload\.[A-Za-z0-9]+$ ]] || exit 2
"${SCP[@]}" ops/deploy.py "$REMOTE:$UPLOAD/deploy.py"
if [[ "$MODE" == site ]]; then
  "${SCP[@]}" "$PAYLOAD" "$REMOTE:$UPLOAD/site.tgz"
else
  [[ -f "$RECORD" ]] || exit 2
  "${SCP[@]}" "$PAYLOAD" "$REMOTE:$UPLOAD/package.bin"
  "${SCP[@]}" "$RECORD" "$REMOTE:$UPLOAD/record.json"
  if [[ -n "$SITE_PAYLOAD" ]]; then
    [[ -f "$SITE_PAYLOAD" ]] || exit 2
    "${SCP[@]}" "$SITE_PAYLOAD" "$REMOTE:$UPLOAD/site.tgz"
  fi
fi
if [[ "$MODE" == site || -n "$SITE_PAYLOAD" ]]; then
  # 首次初始化和日常更新都在 GitHub runner 发起，无需开发者本机 SSH。
  "${SCP[@]}" ops/bootstrap.sh ops/compose.yml ops/nginx-site.conf "$REMOTE:$UPLOAD/"
  "${SSH[@]}" "$REMOTE" "bash '$UPLOAD/bootstrap.sh'"
else
  "${SSH[@]}" "$REMOTE" "python3 '$UPLOAD/deploy.py' release '$UPLOAD/package.bin' '$UPLOAD/record.json'"
fi
# 不递归删除服务器路径，上传目录保留用于排障；安装包已复制到独立下载目录。
if ! curl --fail --silent --show-error --retry 2 https://daywish.alvis.org.cn/healthz; then
  if [[ "$MODE" == site || -n "$SITE_PAYLOAD" ]]; then
    "${SSH[@]}" "$REMOTE" "if [ -f /srv/daywish/state/previous-site.json ]; then python3 '$UPLOAD/deploy.py' rollback-site; fi"
  fi
  exit 1
fi
