#!/bin/bash
# Generates every app-icon size from a single source logo using macOS `sips`.
# 1. Save your square logo (PNG, ~1000x1000) to:  public/app-icon-src.png
# 2. Run:  bash scripts/gen-icons.sh
set -e
cd "$(dirname "$0")/.."

SRC="public/app-icon-src.png"
if [ ! -f "$SRC" ]; then
  echo "❌ Save your logo to $SRC first, then re-run."
  exit 1
fi

echo "Generating icons from $SRC …"
sips -s format png -Z 180 "$SRC" --out public/apple-touch-icon.png >/dev/null
sips -s format png -Z 192 "$SRC" --out public/icon-192.png >/dev/null
sips -s format png -Z 512 "$SRC" --out public/icon-512.png >/dev/null
cp public/icon-512.png public/icon-maskable-512.png
# Browser-tab favicon (Next uses app/icon.png; drop the old .ico so it wins).
sips -s format png -Z 512 "$SRC" --out src/app/icon.png >/dev/null
rm -f src/app/favicon.ico public/favicon.ico

echo "✅ Done: apple-touch-icon, icon-192, icon-512, icon-maskable-512, favicon."
