#!/usr/bin/env bash
# 复用 production 部署凭据，在服务器签名；私钥从不传回 GitHub runner。
set -euo pipefail
MODE="${1:?prepare 或 sign}"
[[ "$MODE" == prepare || "$MODE" == sign ]] || exit 2
HOST="${DEPLOY_HOST:-152.136.107.93}"
PORT="${DEPLOY_PORT:-22}"
USER_NAME="${DEPLOY_USER:-alvis}"
[[ "$HOST" == 152.136.107.93 && "$USER_NAME" == alvis && "$PORT" =~ ^[0-9]+$ ]] || exit 2
: "${DEPLOY_SSH_KEY:?缺少部署凭据}"
: "${DEPLOY_KNOWN_HOSTS:?缺少服务器主机公钥}"
TMP="$(mktemp -d)"
trap 'rm -rf -- "$TMP"' EXIT
umask 077
printf '%s\n' "$DEPLOY_SSH_KEY" > "$TMP/key"
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$TMP/known_hosts"
SSH=(ssh -i "$TMP/key" -p "$PORT" -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$TMP/known_hosts")
SCP=(scp -i "$TMP/key" -P "$PORT" -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$TMP/known_hosts")
REMOTE="$USER_NAME@$HOST"
UPLOAD="$("${SSH[@]}" "$REMOTE" 'test -w /srv/daywish && mkdir -p /srv/daywish/incoming && mktemp -d /srv/daywish/incoming/macsign.XXXXXXXX')"
[[ "$UPLOAD" =~ ^/srv/daywish/incoming/macsign\.[A-Za-z0-9]+$ ]] || exit 2
"${SCP[@]}" ops/deploy.py ops/mac-update-signing.py "$REMOTE:$UPLOAD/"
if [[ "$MODE" == prepare ]]; then
  PUBLIC="$("${SSH[@]}" "$REMOTE" "python3 '$UPLOAD/mac-update-signing.py' public-key")"
  export PUBLIC
  python3 -c 'import os,base64; assert len(base64.b64decode(os.environ["PUBLIC"], validate=True)) == 32'
  printf 'DAYWISH_UPDATE_PUBLIC_KEY=%s\n' "$PUBLIC" >> "${GITHUB_ENV:?只在 GitHub 工作流运行}"
  printf 'Mac 更新公钥已取得，私钥保留在服务器。\n'
else
  FILE="${2:?Mac ZIP 路径}"
  [[ -f "$FILE" && "$FILE" == *.zip ]] || exit 2
  SHA="$(shasum -a 256 "$FILE" | cut -d ' ' -f 1)"
  [[ "$SHA" =~ ^[0-9a-f]{64}$ ]] || exit 2
  "${SCP[@]}" "$FILE" "$REMOTE:$UPLOAD/package.zip"
  "${SSH[@]}" "$REMOTE" "python3 '$UPLOAD/mac-update-signing.py' sign '$UPLOAD/package.zip' '$SHA'" > "$FILE.signature.json"
  printf 'Mac 更新包已签名，待生成版本记录时再次校验。\n'
fi
