#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
VERSION="${DAYWISH_VERSION:-$(awk -F'"' '/"version":/ {print $4; exit}' ../package.json)}"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "版本号必须为三段数字。"
  exit 1
fi
if ! xcrun --find swift >/dev/null 2>&1; then
  echo "请先安装 Xcode 27 或更新版本，并选择对应的 Command Line Tools。"
  exit 1
fi
SDK_VERSION="$(xcrun --sdk macosx --show-sdk-version)"
SDK_MAJOR="${SDK_VERSION%%.*}"
if [ "$SDK_MAJOR" -lt 27 ]; then
  echo "当前 macOS SDK 为 $SDK_VERSION。交互式 Liquid Glass 需要 Xcode 27 / macOS 27 SDK。"
  echo "请安装新版本 Xcode，并在 Xcode 设置中选择对应的 Command Line Tools。"
  exit 1
fi
# 构建前直接同步权威 JSON，无须安装 Node 或任何第三方依赖。
mkdir -p Sources/DaywishCore/Resources
cp ../shared/calendar.json ../shared/springs.json ../shared/date-cases.json Sources/DaywishCore/Resources/
swift test
swift build -c release
BIN_PATH="$(swift build -c release --show-bin-path)"
APP="$(pwd)/build/好日将至.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN_PATH/Daywish" "$APP/Contents/MacOS/Daywish"
cp Info.plist "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $VERSION" "$APP/Contents/Info.plist"
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
ditto -c -k --sequesterRsrc --keepParent "$APP" "build/Daywish-$VERSION-macOS-$(uname -m).zip"
echo "构建完成：$APP"
echo "将应用拖入“应用程序”。首次打开如被拦截，到“隐私与安全性”选择“仍要打开”。"
