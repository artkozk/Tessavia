#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ARTIFACT_ROOT="${RUNNER_TEMP:-$SCRIPT_DIR/.build}/tessavie-ios"
mkdir -p "$ARTIFACT_ROOT"
cd "$SCRIPT_DIR"
xcodegen generate --spec project.yml
xcodebuild -project TessavieWidgets.xcodeproj -scheme TessavieWidgets \
  -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$ARTIFACT_ROOT/DerivedData" CODE_SIGNING_ALLOWED=NO build \
  2>&1 | tee "$ARTIFACT_ROOT/build.log"
SIMULATOR_ID="$(xcrun simctl list devices available -j | python3 -c 'import json,sys; d=json.load(sys.stdin); ids=[v["udid"] for v in d["devices"].get("com.apple.CoreSimulator.SimRuntime.iOS-18-5",[]) if v.get("isAvailable") and v["name"].startswith("iPhone")]; assert ids,"Xcode 16.4 validation requires an available iOS 18.5 iPhone simulator"; print(ids[0])')"
xcodebuild -project TessavieWidgets.xcodeproj -scheme TessavieWidgetTests \
  -configuration Debug -sdk iphonesimulator -destination "platform=iOS Simulator,id=$SIMULATOR_ID" \
  -derivedDataPath "$ARTIFACT_ROOT/DerivedData" -resultBundlePath "$ARTIFACT_ROOT/WidgetTests.xcresult" \
  CODE_SIGNING_ALLOWED=NO test 2>&1 | tee "$ARTIFACT_ROOT/test.log"
mkdir -p "$ARTIFACT_ROOT/Renders"
xcrun xcresulttool export attachments --path "$ARTIFACT_ROOT/WidgetTests.xcresult" --output-path "$ARTIFACT_ROOT/Renders"
