#!/usr/bin/env bash
# GitHub Actions 共用上传入口；凭据只通过环境变量和临时文件传入。
set -euo pipefail
MODE="${1:?site 或 release}"
PAYLOAD="${2:?产物路径}"
RECORD="${3:-}"
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
UPLOAD="$("${SSH[@]}" "$REMOTE" 'mkdir -p /srv/daywish/incoming && mktemp -d /srv/daywish/incoming/upload.XXXXXXXX')"
[[ "$UPLOAD" =~ ^/srv/daywish/incoming/upload\.[A-Za-z0-9]+$ ]] || exit 2
"${SCP[@]}" ops/deploy.py "$REMOTE:$UPLOAD/deploy.py"
if [[ "$MODE" == site ]]; then
  "${SCP[@]}" "$PAYLOAD" "$REMOTE:$UPLOAD/site.tgz"
  "${SSH[@]}" "$REMOTE" "python3 '$UPLOAD/deploy.py' site '$UPLOAD/site.tgz' --probe http://127.0.0.1:8085"
else
  [[ -f "$RECORD" ]] || exit 2
  "${SCP[@]}" "$PAYLOAD" "$REMOTE:$UPLOAD/package.bin"
  "${SCP[@]}" "$RECORD" "$REMOTE:$UPLOAD/record.json"
  "${SSH[@]}" "$REMOTE" "python3 '$UPLOAD/deploy.py' release '$UPLOAD/package.bin' '$UPLOAD/record.json'"
fi
# 不递归删除服务器路径，上传目录保留用于排障；安装包已复制到独立下载目录。
if ! curl --fail --silent --show-error --retry 2 https://daywish.alvis.org.cn/healthz; then
  if [[ "$MODE" == site ]]; then
    "${SSH[@]}" "$REMOTE" "python3 '$UPLOAD/deploy.py' rollback-site"
  fi
  exit 1
fi
