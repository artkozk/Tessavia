import XCTest
import SwiftUI
import UIKit

final class WidgetAppearanceTests: XCTestCase {
    private let date = Date(timeIntervalSince1970: 1789403400)
    private let dimensions: [(String, WidgetContentSize, CGFloat, CGFloat)] = [
        ("small", .small, 170, 170), ("medium", .medium, 364, 170), ("large", .large, 364, 382)
    ]
    private func sample(progress: Bool = false) -> CachedWidgetSnapshot {
        let snapshot = WidgetSnapshot(widgetId: String(repeating: "a", count: 32),
            title: "Очень длинное название блока: привычки, чтение и важные планы на каждый день",
            kind: progress ? "progress" : "tracker", completed: 499, total: 500,
            items: progress ? [] : (0..<8).map { .init(label: "Длинное название пункта \($0 + 1): прочитать главу и сохранить заметку о прочитанном", checked: $0 < 3) },
            updatedAt: ISO8601DateFormatter().string(from: date), openUrl: "/")
        return CachedWidgetSnapshot(snapshot: snapshot, fetchedAt: date, expiresAt: date.addingTimeInterval(86400))
    }
    @MainActor private func render(name: String, size: WidgetContentSize, width: CGFloat, height: CGFloat,
                                   scheme: ColorScheme, cache: CachedWidgetSnapshot?, message: String = "") throws {
        let content = ConstructorWidgetContent(cache: cache, message: message, size: size)
            .padding(16).frame(width: width, height: height)
            .background(TessavieTheme.background(scheme))
            .environment(\.colorScheme, scheme).environment(\.locale, Locale(identifier: "ru_RU"))
            .environment(\.timeZone, TimeZone(secondsFromGMT: 3 * 3600)!)
        let renderer = ImageRenderer(content: content)
        renderer.scale = 2
        let image = try XCTUnwrap(renderer.uiImage)
        XCTAssertEqual(image.size.width, width)
        XCTAssertEqual(image.size.height, height)
        let data = try XCTUnwrap(image.pngData())
        XCTAssertGreaterThan(data.count, 1000)
        let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.png")
        attachment.name = "\(name)-\(scheme == .dark ? "dark" : "light").png"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
    @MainActor func testRenderAllWidgetSizesWithLongRussianLabels() throws {
        for (name, size, width, height) in dimensions {
            for scheme in [ColorScheme.light, .dark] {
                try render(name: name, size: size, width: width, height: height, scheme: scheme, cache: sample())
            }
        }
    }
    @MainActor func testRenderSmallOfflineAndUnavailableStates() throws {
        for scheme in [ColorScheme.light, .dark] {
            try render(name: "small-offline", size: .small, width: 170, height: 170, scheme: scheme,
                cache: sample(progress: true), message: "Не удалось обновить · сохранённая копия")
            try render(name: "small-unavailable", size: .small, width: 170, height: 170, scheme: scheme,
                cache: nil, message: "Доступ отключён. Подключите источник заново в Tessavie Widgets")
        }
    }
}
