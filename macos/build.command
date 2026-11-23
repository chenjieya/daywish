#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
export MACOSX_DEPLOYMENT_TARGET=12.0
VERSION="${DAYWISH_VERSION:-$(awk -F'"' '/"version":/ {print $4; exit}' ../package.json)}"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "版本号必须为三段数字。"
  exit 1
fi
if ! xcrun --find swift >/dev/null 2>&1; then
  echo "请先安装 Xcode 26 或更新版本，并选择对应的 Command Line Tools。"
  exit 1
fi
SDK_VERSION="$(xcrun --sdk macosx --show-sdk-version)"
SDK_MAJOR="${SDK_VERSION%%.*}"
if [ "$SDK_MAJOR" -lt 26 ]; then
  echo "当前 macOS SDK 为 $SDK_VERSION。构建原生玻璃兼容分支需要 Xcode 26 / macOS 26 SDK。"
  echo "请安装新版本 Xcode，并在 Xcode 设置中选择对应的 Command Line Tools。"
  exit 1
fi
SWIFT_FLAGS=()
if [ "$SDK_MAJOR" -ge 27 ]; then SWIFT_FLAGS+=(-Xswiftc -DDAYWISH_MACOS27_SDK); fi
# 仅接收发布工作流从部署服务器获取的公开验签密钥，私钥不进入应用。
python3 -c 'import base64,os; assert len(base64.b64decode(os.environ.get("DAYWISH_UPDATE_PUBLIC_KEY", ""), validate=True)) == 32, "缺少有效的 DAYWISH_UPDATE_PUBLIC_KEY"'
# 构建前同步权威 JSON；SwiftPM 下载固定版本的 Sparkle 并校验官方二进制。
mkdir -p Sources/DaywishCore/Resources
cp ../shared/calendar.json ../shared/springs.json ../shared/date-cases.json Sources/DaywishCore/Resources/
swift test "${SWIFT_FLAGS[@]}"
swift build -c release "${SWIFT_FLAGS[@]}"
BIN_PATH="$(swift build -c release "${SWIFT_FLAGS[@]}" --show-bin-path)"
APP="$(pwd)/build/好日将至.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN_PATH/Daywish" "$APP/Contents/MacOS/Daywish"
cp Info.plist "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $VERSION" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :SUPublicEDKey string $DAYWISH_UPDATE_PUBLIC_KEY" "$APP/Contents/Info.plist"
FRAMEWORK="$(find .build/artifacts -type d -name Sparkle.framework -print -quit)"
[[ -n "$FRAMEWORK" ]] || { echo '::error::未找到 Sparkle.framework'; exit 1; }
mkdir -p "$APP/Contents/Frameworks"
ditto "$FRAMEWORK" "$APP/Contents/Frameworks/Sparkle.framework"
ICONSET="$(pwd)/build/Daywish.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" ../public/icon.png --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" ../public/icon.png --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/Daywish.icns"
for resource in "$BIN_PATH"/*.bundle; do
  if [ -d "$resource" ]; then cp -R "$resource" "$APP/Contents/Resources/"; fi
done
# 本地临时签名免费，不是 Developer ID 签名或 Apple 公证。
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"
python3 ../scripts/verify-macos-compatibility.py "$APP"
if [[ "${DAYWISH_SMOKE_TEST:-0}" == 1 ]]; then
  for LEGACY in 0 1; do
    LOG="build/launch-$LEGACY.log"
    DAYWISH_LEGACY_MATERIAL="$LEGACY" "$APP/Contents/MacOS/Daywish" > "$LOG" 2>&1 &
    SMOKE_PID=$!
    trap 'kill -TERM "$SMOKE_PID" 2>/dev/null || true' EXIT
    READY=0
    for attempt in $(seq 1 20); do
      if grep -q 'DAYWISH_READY:' "$LOG"; then READY=1; break; fi
      if ! kill -0 "$SMOKE_PID" 2>/dev/null; then break; fi
      sleep 0.5
    done
    kill -TERM "$SMOKE_PID" 2>/dev/null || true
    wait "$SMOKE_PID" 2>/dev/null || true
    trap - EXIT
    cat "$LOG"
    if [[ "$READY" != 1 ]]; then
      echo '::error title=Mac 启动检查失败::应用未完成资源加载与原生窗口初始化'
      exit 1
    fi
  done
fi
ditto -c -k --sequesterRsrc --keepParent "$APP" "build/Daywish-$VERSION-macOS-$(uname -m).zip"
echo "构建完成：$APP"
echo "将应用拖入“应用程序”。首次打开如被拦截，到“隐私与安全性”选择“仍要打开”。"
