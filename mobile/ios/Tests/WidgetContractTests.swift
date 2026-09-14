import XCTest
import Foundation

final class MemoryWidgetVault: WidgetCredentialVault {
    private var values: [String: Data] = [:]
    func read(_ account: String) throws -> Data? { values[account] }
    func write(_ data: Data, account: String) throws { values[account] = data }
    func remove(_ account: String) throws { values.removeValue(forKey: account) }
}

final class WidgetContractTests: XCTestCase {
    let id = String(repeating: "a", count: 32)
    let token = String(repeating: "b", count: 64)
    func grant(now: Date = Date()) -> WidgetGrant { WidgetGrant(id: id, token: token, expiresAt: now.addingTimeInterval(3600)) }
    func snapshot(id: String? = nil, now: Date = Date(), total: Int = 12, completed: Int = 1,
                  kind: String = "tracker", openUrl: String = "/", itemCount: Int = 2) -> WidgetSnapshot {
        WidgetSnapshot(widgetId: id ?? self.id, title: "Мой приватный блок", kind: kind, completed: completed, total: total,
            items: (0..<itemCount).map { .init(label: "Личный пункт \($0)", checked: $0 == 0) },
            updatedAt: ISO8601DateFormatter().string(from: now), openUrl: openUrl)
    }
    func store() throws -> (WidgetStore, URL, MemoryWidgetVault) {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let vault = MemoryWidgetVault()
        let store = try WidgetStore(directory: directory, vault: vault)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        return (store, directory, vault)
    }
    func testPairingAndGrantValidationAndRedaction() throws {
        XCTAssertTrue(WidgetContract.isHex(id, length: 32))
        for value in ["", id.uppercased(), id + "0", " " + id, String(repeating: "z", count: 32)] {
            XCTAssertFalse(WidgetContract.isHex(value, length: 32))
        }
        let expires = ISO8601DateFormatter().string(from: Date().addingTimeInterval(3600))
        let data = try JSONSerialization.data(withJSONObject: ["widgetId": id, "token": token, "expiresAt": expires])
        let result = try WidgetGrant.decode(data)
        XCTAssertEqual(result.id, id)
        XCTAssertFalse(String(describing: result).contains(token))
        XCTAssertFalse(String(reflecting: result).contains(token))
        XCTAssertFalse(result.isUsable(at: result.expiresAt))
        let bad = try JSONSerialization.data(withJSONObject: ["widgetId": id, "token": "short", "expiresAt": expires])
        XCTAssertThrowsError(try WidgetGrant.decode(bad))
        XCTAssertThrowsError(try WidgetGrant.decode(Data(repeating: 32, count: 4097)))
    }
    func testDatesAcceptNanosecondsAndWholeSeconds() {
        XCTAssertNotNil(WidgetContract.parseDate("2026-09-14T12:30:00.123456789Z"))
        XCTAssertNotNil(WidgetContract.parseDate("2026-09-14T12:30:00Z"))
        XCTAssertNil(WidgetContract.parseDate("yesterday"))
    }
    func testOpenURLAndOriginRejectExternalOrCredentialBearingAddresses() throws {
        XCTAssertEqual(try WidgetContract.openURL("/"), WidgetContract.website)
        for path in ["//attacker.invalid", "https://attacker.invalid/", "/?token=secret", "/#secret", "/notes", "javascript:alert(1)", "https://control.e-rd.ru/"] {
            XCTAssertThrowsError(try WidgetContract.openURL(path))
        }
        for value in ["http://control.e-rd.ru/", "https://control.e-rd.ru.attacker.invalid/", "https://user:secret@control.e-rd.ru/",
                      "https://control.e-rd.ru:444/", "https://control.e-rd.ru/?token=secret", "https://control.e-rd.ru/#secret"] {
            XCTAssertFalse(WidgetContract.isSameOrigin(URL(string: value)!))
        }
        XCTAssertTrue(WidgetContract.isSameOrigin(URL(string: "https://control.e-rd.ru:443/api/mobile/widget")!))
    }
    func testSnapshotValidationPreventsWrongSourceAndImpossibleProgress() throws {
        let now = Date()
        let valid = snapshot(now: now)
        XCTAssertEqual(try WidgetSnapshot.decode(JSONEncoder().encode(valid), for: id, now: now), valid)
        for invalid in [snapshot(id: String(repeating: "c", count: 32), now: now), snapshot(now: now, total: -1),
                        snapshot(now: now, total: 501), snapshot(now: now, completed: 13), snapshot(now: now, completed: -1),
                        snapshot(now: now, kind: "form"), snapshot(now: now, openUrl: "/?secret=x"), snapshot(now: now, itemCount: 9),
                        snapshot(now: now, kind: "progress"), snapshot(now: now.addingTimeInterval(3600))] {
            XCTAssertThrowsError(try invalid.validate(for: id, now: now))
        }
        XCTAssertNoThrow(try snapshot(now: now, kind: "progress", itemCount: 0).validate(for: id, now: now))
        XCTAssertThrowsError(try WidgetSnapshot.decode(Data(repeating: 0, count: 16_385), for: id))
    }
    func testCacheExpiresAtGrantOrTwentyFourHoursAndRejectsClockRollback() throws {
        let now = Date()
        let short = grant(now: now)
        let cache = CachedWidgetSnapshot(snapshot: snapshot(now: now), fetchedAt: now, expiresAt: short.expiresAt)
        XCTAssertTrue(cache.isUsable(for: short, now: now))
        XCTAssertFalse(cache.isUsable(for: short, now: short.expiresAt))
        XCTAssertFalse(cache.isUsable(for: short, now: now.addingTimeInterval(-600)))
        let long = WidgetGrant(id: id, token: token, expiresAt: now.addingTimeInterval(3 * 86400))
        let longCache = CachedWidgetSnapshot(snapshot: snapshot(now: now), fetchedAt: now, expiresAt: long.expiresAt)
        XCTAssertEqual(longCache.hideAt, now.addingTimeInterval(86400))
        XCTAssertFalse(longCache.isUsable(for: long, now: now.addingTimeInterval(86400)))
        XCTAssertFalse(cache.isUsable(for: long, now: now))
    }
    func testEncryptedStoreContainsNoTokenOrPrivateLabels() throws {
        let (store, directory, _) = try store()
        let now = Date(), credential = grant()
        try store.add(credential)
        try store.save(snapshot(now: now), for: credential, now: now)
        let loaded = try XCTUnwrap(store.cached(for: credential, now: now))
        XCTAssertEqual(loaded.snapshot.title, "Мой приватный блок")
        XCTAssertEqual(try store.grants().map(\.id), [id])
        for file in try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) {
            let raw = try Data(contentsOf: file)
            XCTAssertNil(raw.range(of: Data(token.utf8)))
            XCTAssertNil(raw.range(of: Data("Мой приватный блок".utf8)))
            XCTAssertNil(raw.range(of: Data("Личный пункт".utf8)))
        }
    }
    func testDisconnectStopsLateFetchFromResurrectingCache() throws {
        let (store, _, _) = try store()
        let credential = grant()
        try store.add(credential)
        try store.save(snapshot(), for: credential)
        try store.remove(id)
        XCTAssertNil(try store.grant(id))
        XCTAssertNil(try store.cached(for: credential))
        XCTAssertThrowsError(try store.save(snapshot(), for: credential)) { XCTAssertEqual($0 as? WidgetFailure, .accessDenied) }
        XCTAssertTrue(try store.grants().isEmpty)
        XCTAssertNoThrow(try store.remove(id))
    }
    func testTamperedAndExpiredCacheIsNotReturned() throws {
        let (store, directory, _) = try store()
        let now = Date(), credential = grant(now: now)
        try store.add(credential, now: now)
        try store.save(snapshot(now: now), for: credential, now: now)
        let file = directory.appendingPathComponent("\(id).sealed")
        try Data("tampered private content".utf8).write(to: file)
        XCTAssertNil(try store.cached(for: credential, now: now))
        XCTAssertFalse(FileManager.default.fileExists(atPath: file.path))
        try store.save(snapshot(now: now), for: credential, now: now)
        XCTAssertNil(try store.cached(for: credential, now: credential.expiresAt))
    }
    func testStorageRejectsPathTraversalAndOldCredential() throws {
        let (store, _, _) = try store()
        let credential = grant()
        try store.add(credential)
        let changed = WidgetGrant(id: id, token: String(repeating: "c", count: 64), expiresAt: credential.expiresAt)
        try store.add(changed)
        XCTAssertThrowsError(try store.save(snapshot(), for: credential))
        XCTAssertNil(try store.grant("../sources"))
        XCTAssertThrowsError(try store.add(WidgetGrant(id: "../sources", token: token, expiresAt: credential.expiresAt)))
    }
    func testRequestsCarryOnlyRequiredCredentialAndNeverInURL() throws {
        let api = WidgetAPI()
        let pair = try api.makeRequest(path: "/api/mobile/widgets/redeem", code: id)
        XCTAssertEqual(pair.httpMethod, "POST")
        XCTAssertNil(pair.value(forHTTPHeaderField: "Authorization"))
        XCTAssertNil(pair.value(forHTTPHeaderField: "Cookie"))
        XCTAssertFalse(pair.url!.absoluteString.contains(id))
        XCTAssertFalse(pair.httpShouldHandleCookies)
        let read = try api.makeRequest(path: "/api/mobile/widget", token: token)
        XCTAssertEqual(read.value(forHTTPHeaderField: "Authorization"), "Bearer \(token)")
        XCTAssertNil(read.httpBody)
        XCTAssertFalse(read.url!.absoluteString.contains(token))
        XCTAssertThrowsError(try api.makeRequest(path: "/api/me", token: token))
        XCTAssertThrowsError(try api.makeRequest(path: "/api/mobile/widgets/redeem", token: token, code: id))
        XCTAssertThrowsError(try api.makeRequest(path: "/api/mobile/widget", token: token, code: id))
    }
    func testRedirectDelegateRefusesEvenSameOriginRedirect() {
        let api = WidgetAPI()
        let session = URLSession(configuration: .ephemeral)
        defer { session.invalidateAndCancel() }
        let task = session.dataTask(with: WidgetContract.website)
        let response = HTTPURLResponse(url: WidgetContract.website, statusCode: 302, httpVersion: "HTTP/1.1", headerFields: nil)!
        for url in [WidgetContract.website, URL(string: "https://attacker.invalid/")!] {
            var invoked = false
            api.urlSession(session, task: task, willPerformHTTPRedirection: response, newRequest: URLRequest(url: url)) { request in
                invoked = true; XCTAssertNil(request)
            }
            XCTAssertTrue(invoked)
        }
    }
    func testErrorsDoNotExposeProviderBodiesOrCredentials() {
        for status in [401, 403] {
            XCTAssertThrowsError(try WidgetContract.status(status, pairing: false)) { XCTAssertEqual($0 as? WidgetFailure, .accessDenied) }
            XCTAssertThrowsError(try WidgetContract.status(status, pairing: true)) { XCTAssertEqual($0 as? WidgetFailure, .invalidCode) }
        }
        XCTAssertThrowsError(try WidgetContract.status(429, pairing: false)) { XCTAssertEqual($0 as? WidgetFailure, .rateLimited) }
        XCTAssertThrowsError(try WidgetContract.status(302, pairing: false))
        XCTAssertThrowsError(try WidgetContract.status(500, pairing: true))
        for failure in [WidgetFailure.invalidCode, .invalidResponse, .accessDenied, .unavailable, .rateLimited, .storageUnavailable] {
            XCTAssertFalse(failure.localizedDescription.contains(token))
        }
    }
}
