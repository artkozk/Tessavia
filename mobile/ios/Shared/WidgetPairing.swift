import Foundation

enum WidgetPairing {
    // This order is shared by the app and tests: known local storage failures
    // cannot burn a five-minute, single-use server code.
    static func redeem(code: String, localName: String, store: WidgetStore,
                       exchange: (String) async throws -> WidgetGrant) async throws -> WidgetGrant {
        guard WidgetContract.isHex(code, length: 32) else { throw WidgetFailure.invalidCode }
        let name = localName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard name.count <= 80, !name.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else {
            throw WidgetFailure.invalidName
        }
        try store.verifyWritable()
        var grant = try await exchange(code)
        grant.localName = name.isEmpty ? nil : name
        return grant
    }
}
