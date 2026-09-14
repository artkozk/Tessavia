import Foundation

final class WidgetAPI: NSObject, URLSessionTaskDelegate {
    private let configurationFactory: () -> URLSessionConfiguration
    init(configurationFactory: @escaping () -> URLSessionConfiguration = { .ephemeral }) {
        self.configurationFactory = configurationFactory
    }
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil) // Even same-origin redirects fail; no credential forwards.
    }
    func makeRequest(path: String, token: String? = nil, code: String? = nil) throws -> URLRequest {
        guard ["/api/mobile/widgets/redeem", "/api/mobile/widget"].contains(path) else { throw WidgetFailure.invalidResponse }
        let url = WidgetContract.origin.appendingPathComponent(String(path.dropFirst()))
        guard WidgetContract.isSameOrigin(url) else { throw WidgetFailure.invalidResponse }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if path == "/api/mobile/widgets/redeem" {
            guard token == nil, let code, WidgetContract.isHex(code, length: 32) else { throw WidgetFailure.invalidCode }
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(["code": code])
        } else {
            guard code == nil, let token, WidgetContract.isHex(token, length: 64) else { throw WidgetFailure.accessDenied }
            request.httpMethod = "GET"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }
    private func send(_ request: URLRequest, pairing: Bool) async throws -> Data {
        let config = configurationFactory()
        config.httpCookieStorage = nil
        config.httpShouldSetCookies = false
        config.urlCredentialStorage = nil
        config.urlCache = nil
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 20
        let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        do {
            let (data, response) = try await session.data(for: request)
            guard let response = response as? HTTPURLResponse, let url = response.url,
                  WidgetContract.isSameOrigin(url), url.path == request.url?.path else { throw WidgetFailure.invalidResponse }
            try WidgetContract.status(response.statusCode, pairing: pairing)
            guard data.count <= 16_384 else { throw WidgetFailure.invalidResponse }
            return data
        } catch let failure as WidgetFailure { throw failure }
        catch { throw WidgetFailure.unavailable } // Never display/log raw server errors or requests.
    }
    func redeem(code: String) async throws -> WidgetGrant {
        let request = try makeRequest(path: "/api/mobile/widgets/redeem", code: code)
        return try WidgetGrant.decode(await send(request, pairing: true))
    }
    func snapshot(for grant: WidgetGrant) async throws -> WidgetSnapshot {
        guard grant.isUsable(at: Date()) else { throw WidgetFailure.accessDenied }
        let request = try makeRequest(path: "/api/mobile/widget", token: grant.token)
        return try WidgetSnapshot.decode(await send(request, pairing: false), for: grant.id)
    }
}
