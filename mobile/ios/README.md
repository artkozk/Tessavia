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

## Review update — 15 September 2026

The first macOS validation passed: commit `d3e190c`, GitHub Actions run
`34896697660`, unsigned app/extension build and 12 tests with zero failures.
The changes below need their own subsequent CI result; the first pass does not
cover them automatically.

The test script now explicitly selects an **iOS 18.5 iPhone simulator**, matching
Xcode 16.4. It also exports XCTest PNG attachments into `Renders/` beside
`WidgetTests.xcresult`. The images render the same SwiftUI content as the extension
in representative small, medium and large frames, with light/dark colours,
long Russian labels, offline and unavailable states. They are simulator renders,
not screenshots of a provisioned phone or proof of system timeline behaviour.

For pairing on the currently deployed website, open **Настройки → Личные
настройки → На телефоне**. The common code controls currently appear under
**«Виджеты Android»**; a developer testing the iOS companion can use the same
block/code contract and call that access `iPhone`. The public site still states
that the iOS system widget is not ready: there is no signed public iOS package
to install yet. This prototype does not change that distribution status.

The companion supports an optional local source name such as «Привычки дома».
It is stored with the grant in the shared Keychain and appears in the companion
and widget source chooser. It does not rename the block on the website. A
short non-secret source ID distinguishes otherwise unnamed duplicate titles.
Before redeeming a one-time code, the app checks protected storage with actual
write/read/delete probes; a known failed entitlement/storage check sends no
redeem request. A storage failure that occurs after a successful exchange is
still possible, and the app explains how to revoke that used access and retry.
