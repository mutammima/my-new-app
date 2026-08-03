#!/usr/bin/env bash
#
# Build an UNSIGNED .ipa of DuoNotes on macOS — no Apple Developer account and
# no EAS cloud required. The resulting .ipa is meant to be installed with
# SideStore (which re-signs it on-device with your free Apple ID) or run inside
# LiveContainer.
#
# Prerequisites on the Mac (see docs/BUILD-IPA.md):
#   • Xcode + Command Line Tools
#   • Node.js LTS, CocoaPods (`sudo gem install cocoapods` or `brew install cocoapods`)
#   • A `.env` file in the project root with your EXPO_PUBLIC_SUPABASE_* values
#     (the Supabase URL + publishable key get baked into the build).
#
# Usage:
#   bash scripts/build-unsigned-ipa.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "❌ No .env found. Copy .env.example to .env and fill in your Supabase values first."
  exit 1
fi

echo "▶︎ Generating native iOS project (expo prebuild)…"
npx expo prebuild --platform ios --clean

WORKSPACE=$(ls -d ios/*.xcworkspace | head -n1)
SCHEME=$(basename "$WORKSPACE" .xcworkspace)
echo "▶︎ Building scheme '$SCHEME' (Release, code signing disabled)…"

rm -rf build
xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -sdk iphoneos \
  -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  | tail -n 20

APP=$(ls -d build/Build/Products/Release-iphoneos/*.app | head -n1)
if [ -z "${APP:-}" ]; then
  echo "❌ Build produced no .app — check the xcodebuild output above."
  exit 1
fi

echo "▶︎ Packaging $APP into an .ipa…"
rm -rf Payload "$SCHEME-unsigned.ipa"
mkdir Payload
cp -R "$APP" Payload/
zip -qr "$SCHEME-unsigned.ipa" Payload
rm -rf Payload

# Drop a copy in the shared sideload folder under a stable name, so each build
# replaces the previous one instead of accumulating near-identical .ipa files
# (a stale duplicate there means installing the wrong build).
#
# Deliberately NOT in iCloud Drive. That folder used to live under
# ~/Library/Mobile Documents/…/iOS Apps, and iCloud caused real problems:
# " 2" conflict copies of the .ipa, and files silently dematerialising into
# cloud-only placeholders so a plain `cp`/`mv` would fail or stall. ~/Developer
# is not synced, so what is on disk is simply what is on disk.
SIDELOAD_DIR="$HOME/Developer/iOS Apps"
mkdir -p "$SIDELOAD_DIR"
cp "$SCHEME-unsigned.ipa" "$SIDELOAD_DIR/$SCHEME.ipa"

echo ""
echo "✅ Done: $(pwd)/$SCHEME-unsigned.ipa"
echo "   Copied to: $SIDELOAD_DIR/$SCHEME.ipa"
echo "   Import it into LiveContainer (unsigned — iOS cannot install it directly)."
