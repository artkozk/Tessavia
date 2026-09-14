import Foundation

enum WidgetFailure: Error, LocalizedError, Equatable {
    case invalidCode, invalidResponse, accessDenied, unavailable, rateLimited, storageUnavailable
    var errorDescription: String? {
        switch self {
        case .invalidCode: return "Код недействителен, уже использован или истёк. Создайте новый код в настройках Tessavie."
        case .invalidResponse: return "Не удалось проверить ответ Tessavie. Попробуйте обновить позже."
        case .accessDenied: return "Доступ отключён или источник недоступен. Подключите виджет заново."
        case .unavailable: return "Не удалось связаться с Tessavie. Проверьте интернет."
        case .rateLimited: return "Слишком много запросов. Повторите через минуту."
        case .storageUnavailable: return "Защищённое хранилище недоступно. Разблокируйте телефон и откройте приложение."
        }
    }
}

enum WidgetContract {
    static let origin = URL(string: "https://control.e-rd.ru")!
    static let website = URL(string: "https://control.e-rd.ru/")!
    static let appGroup = "group.ru.tessavie.widgets"
    static let widgetKind = "TessavieConstructorWidget"
    static let maxCacheAge: TimeInterval = 24 * 60 * 60
    static let refreshInterval: TimeInterval = 30 * 60

    static func isHex(_ value: String, length: Int) -> Bool {
        value.utf8.count == length && value.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
    }
    static func parseDate(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }
    static func isSameOrigin(_ url: URL) -> Bool {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return false }
        return parts.scheme == "https" && parts.host == "control.e-rd.ru" && (parts.port == nil || parts.port == 443)
            && parts.user == nil && parts.password == nil && parts.query == nil && parts.fragment == nil
    }
    static func openURL(_ value: String) throws -> URL {
        // The current server explicitly supports root only. Do not expand this
        // allowlist to arbitrary server-controlled deep links or query tokens.
        guard value == "/" else { throw WidgetFailure.invalidResponse }
        return website
    }
    static func status(_ code: Int, pairing: Bool) throws {
        if code == (pairing ? 201 : 200) { return }
        if code == 429 { throw WidgetFailure.rateLimited }
        if pairing && [400, 401, 403, 404].contains(code) { throw WidgetFailure.invalidCode }
        if [401, 403].contains(code) { throw WidgetFailure.accessDenied }
        throw WidgetFailure.unavailable
    }
}

struct WidgetGrant: Codable, Equatable, CustomStringConvertible, CustomDebugStringConvertible {
    let id: String
    let token: String
    let expiresAt: Date
    var description: String { "WidgetGrant(redacted)" }
    var debugDescription: String { description }
    func isUsable(at now: Date) -> Bool {
        WidgetContract.isHex(id, length: 32) && WidgetContract.isHex(token, length: 64) && expiresAt > now
    }
    static func decode(_ data: Data, now: Date = Date()) throws -> WidgetGrant {
        struct Response: Decodable { let widgetId: String; let token: String; let expiresAt: String }
        guard data.count <= 4096, let response = try? JSONDecoder().decode(Response.self, from: data),
              let expiry = WidgetContract.parseDate(response.expiresAt), expiry <= now.addingTimeInterval(91 * 86400) else {
            throw WidgetFailure.invalidResponse
        }
        let grant = WidgetGrant(id: response.widgetId, token: response.token, expiresAt: expiry)
        guard grant.isUsable(at: now) else { throw WidgetFailure.invalidResponse }
        return grant
    }
}

struct WidgetSnapshot: Codable, Equatable {
    struct Item: Codable, Equatable { let label: String; let checked: Bool }
    let widgetId: String
    let title: String
    let kind: String
    let completed: Int
    let total: Int
    let items: [Item]
    let updatedAt: String
    let openUrl: String

    func validate(for id: String, now: Date = Date()) throws {
        guard widgetId == id, WidgetContract.isHex(id, length: 32), ["tracker", "progress"].contains(kind),
              !title.isEmpty, title.count <= 160, (0...500).contains(total), (0...total).contains(completed),
              items.count <= 8, items.count <= total, (kind != "progress" || items.isEmpty),
              items.allSatisfy({ !$0.label.isEmpty && $0.label.count <= 160 }),
              let updated = WidgetContract.parseDate(updatedAt), updated <= now.addingTimeInterval(300) else {
            throw WidgetFailure.invalidResponse
        }
        _ = try WidgetContract.openURL(openUrl)
    }
    static func decode(_ data: Data, for id: String, now: Date = Date()) throws -> WidgetSnapshot {
        guard data.count <= 16_384, let result = try? JSONDecoder().decode(Self.self, from: data) else { throw WidgetFailure.invalidResponse }
        try result.validate(for: id, now: now)
        return result
    }
}

struct CachedWidgetSnapshot: Codable, Equatable {
    let snapshot: WidgetSnapshot
    let fetchedAt: Date
    let expiresAt: Date
    var hideAt: Date { min(expiresAt, fetchedAt.addingTimeInterval(WidgetContract.maxCacheAge)) }
    func isUsable(for grant: WidgetGrant, now: Date) -> Bool {
        grant.isUsable(at: now) && expiresAt == grant.expiresAt && now < hideAt && fetchedAt <= now.addingTimeInterval(300)
            && (try? snapshot.validate(for: grant.id, now: now)) != nil
    }
}
