# Tessavie Widgets for iOS

Native SwiftUI companion and configurable WidgetKit extension for iOS 17+.
It reads one explicitly paired constructor tracker/progress per widget. It does
not collect a website password, embed the web UI, or write marks from a widget.

Canonical contract and current verification limits:
[`IOS_WIDGET_COMPANION_2026_09_14.md`](../../docs/architecture/IOS_WIDGET_COMPANION_2026_09_14.md).

## Unsigned simulator validation

On macOS with Xcode 16.4+, an iOS simulator and XcodeGen 2.42+:

```bash
bash mobile/ios/ci-test.sh
```

The script generates `TessavieWidgets.xcodeproj`, builds the app and extension,
and runs the hostless `TessavieWidgetTests` scheme. Build output, logs and
`WidgetTests.xcresult` go to `$RUNNER_TEMP/tessavie-ios` in CI or
`mobile/ios/.build/tessavie-ios` locally. No signing identity, paid account,
API token or production user fixture is required for these checks.

The generated project is ignored; edit `project.yml` and the source files.

## Signed device setup

An account owner must provision both bundle identifiers under the same Apple
Developer team and enable the shared capabilities:

- App: `ru.tessavie.widgets.ios`
- Extension: `ru.tessavie.widgets.ios.WidgetExtension`
- App Group: `group.ru.tessavie.widgets`
- Keychain group: `$(AppIdentifierPrefix)ru.tessavie.widgets.shared`

Choose the actual development team in Xcode or pass `DEVELOPMENT_TEAM` while
building; never commit a team private key or provisioning profile. The App
Identifier Prefix is derived from signing. Both targets must get the same
resolved access group, also declared in their Info.plist files.

This scaffold does not publish to App Store/TestFlight or register identifiers.
Unsigned simulator build success does not prove signed shared-Keychain access,
home-screen timelines, physical-device appearance or distribution readiness.
