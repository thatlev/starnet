#!/bin/bash
set -euo pipefail
source_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
[[ $(uname -s) == Darwin ]] || { echo 'This installer is for macOS' >&2; exit 1; }
command -v node >/dev/null
command -v gh >/dev/null
gh api user --jq '{login,id}'
owner_id=$(gh api user --jq .id)
if [[ ! -f "$HOME/.config/starnet-remote/config.json" ]]; then
  node "$source_root/remote/cli.js" configure --host lev-server-direct --owner "$owner_id" --gateway-port 18791
fi
app_target=${1:-/Applications/StarNet Remote.app}
mkdir -p "$source_root/work/mac-build"
build_root=$(mktemp -d "$source_root/work/mac-build/build.XXXXXX")
app_build="$build_root/StarNet Remote.app"
mkdir -p "$app_build/Contents/MacOS" "$app_build/Contents/Resources/sidecar" "$app_build/Contents/Resources/remote"
swiftc -target "$(uname -m)-apple-macos13.0" -O -framework Cocoa -framework WebKit "$source_root/remote/LoadingView.swift" "$source_root/remote/StationMac.swift" -o "$app_build/Contents/MacOS/StarNetRemote"
cp "$source_root/remote/cli.js" "$source_root/remote/gateway.js" "$source_root/remote/startup-observer.js" "$app_build/Contents/Resources/remote/"
cp "$source_root/sidecar/apiauth.js" "$app_build/Contents/Resources/sidecar/"
cp "$source_root/frontend/assets/brand/starnet-logo.png" "$app_build/Contents/Resources/LoadingLogo.png"
cp "$source_root/NOTICE.md" "$app_build/Contents/Resources/NOTICE.md"
cp "$source_root/remote/assets/VT323.ttf" "$app_build/Contents/Resources/VT323.ttf"
cp "$source_root/src-tauri/icons/icon.icns" "$app_build/Contents/Resources/Station.icns"
cat > "$app_build/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>StarNetRemote</string>
<key>CFBundleIdentifier</key><string>com.thatlev.starnet.remote</string>
<key>CFBundleName</key><string>StarNet Remote</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>CFBundleVersion</key><string>4</string>
<key>CFBundleShortVersionString</key><string>0.1.3</string>
<key>CFBundleIconFile</key><string>Station</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PLIST
git -C "$source_root" rev-parse HEAD > "$app_build/Contents/Resources/SOURCE_REVISION"
codesign --force --sign - "$app_build"
codesign --verify --strict "$app_build"
if [[ -e "$app_target" ]]; then
  osascript -e 'tell application "StarNet Remote" to quit' >/dev/null 2>&1 || true
  sleep 1
  backup_root="$source_root/work/mac-build/replaced-apps"
  mkdir -p "$backup_root"
  backup_target="$backup_root/StarNet Remote $(date +%Y%m%d-%H%M%S).app"
  mv "$app_target" "$backup_target"
fi
ditto "$app_build" "$app_target"
echo "Installed $app_target (local build, ad-hoc signed). No agent tasks created."
