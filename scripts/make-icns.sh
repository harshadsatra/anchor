#!/usr/bin/env bash
# Turns build/icon.png into build/icon.icns using macOS's built-in tools.
set -euo pipefail
cd "$(dirname "$0")/.."
sips -z 1024 1024 build/icon.png --out build/icon.png >/dev/null
rm -rf build/icon.iconset && mkdir -p build/icon.iconset
for S in 16 32 128 256 512; do
  sips -z "$S" "$S" build/icon.png --out "build/icon.iconset/icon_${S}x${S}.png" >/dev/null
  sips -z "$((S*2))" "$((S*2))" build/icon.png --out "build/icon.iconset/icon_${S}x${S}@2x.png" >/dev/null
done
iconutil -c icns build/icon.iconset -o build/icon.icns
rm -rf build/icon.iconset
echo "wrote build/icon.icns"
