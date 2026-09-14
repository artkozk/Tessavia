import Foundation
import Security
import CryptoKit
import Darwin

protocol WidgetCredentialVault {
    func read(_ account: String) throws -> Data?
    func write(_ data: Data, account: String) throws
    func remove(_ account: String) throws
}

final class KeychainWidgetVault: WidgetCredentialVault {
    private let accessGroup: String
    private let service = "ru.tessavie.widgets.credentials"
    init(bundle: Bundle = .main) throws {
        guard let group = bundle.object(forInfoDictionaryKey: "TessavieKeychainAccessGroup") as? String,
              !group.isEmpty, !group.contains("$("), group.hasSuffix("ru.tessavie.widgets.shared") else {
            throw WidgetFailure.storageUnavailable
        }
        accessGroup = group
    }
    private func query(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
         kSecAttrAccount as String: account, kSecAttrAccessGroup as String: accessGroup,
         kSecAttrSynchronizable as String: false]
    }
    func read(_ account: String) throws -> Data? {
        var query = query(account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw WidgetFailure.storageUnavailable }
        return data
    }
    func write(_ data: Data, account: String) throws {
        let query = query(account)
        let attributes: [String: Any] = [kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let updated = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updated == errSecSuccess { return }
        guard updated == errSecItemNotFound else { throw WidgetFailure.storageUnavailable }
        var new = query
        attributes.forEach { new[$0.key] = $0.value }
        guard SecItemAdd(new as CFDictionary, nil) == errSecSuccess else { throw WidgetFailure.storageUnavailable }
    }
    func remove(_ account: String) throws {
        let status = SecItemDelete(query(account) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw WidgetFailure.storageUnavailable }
    }
}

// App and extension use the same App Group, but file reads/writes are serialized
// across processes. A fetch started before disconnect cannot repopulate its cache.
final class WidgetStore {
    private let directory: URL
    private let vault: WidgetCredentialVault
    private let files: FileManager
    private let encryptionAccount = "cache-key-v1"
    init(directory: URL, vault: WidgetCredentialVault, files: FileManager = .default) throws {
        self.directory = directory
        self.vault = vault
        self.files = files
        do { try files.createDirectory(at: directory, withIntermediateDirectories: true,
                                       attributes: [.protectionKey: FileProtectionType.complete]) }
        catch { throw WidgetFailure.storageUnavailable }
        var mutable = directory
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try? mutable.setResourceValues(values)
    }
    static func shared() throws -> WidgetStore {
        guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: WidgetContract.appGroup) else {
            throw WidgetFailure.storageUnavailable
        }
        return try WidgetStore(directory: container.appendingPathComponent("Widgets", isDirectory: true), vault: KeychainWidgetVault())
    }
    private func locked<T>(_ operation: () throws -> T) throws -> T {
        let path = directory.appendingPathComponent("state.lock").path
        let descriptor = Darwin.open(path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
        guard descriptor >= 0 else { throw WidgetFailure.storageUnavailable }
        defer { Darwin.close(descriptor) }
        guard flock(descriptor, LOCK_EX) == 0 else { throw WidgetFailure.storageUnavailable }
        defer { flock(descriptor, LOCK_UN) }
        return try operation()
    }
    private var indexURL: URL { directory.appendingPathComponent("sources.json") }
    private func readIDs() throws -> [String] {
        if !files.fileExists(atPath: indexURL.path) { return [] }
        guard let data = try? Data(contentsOf: indexURL), data.count <= 4096,
              let ids = try? JSONDecoder().decode([String].self, from: data), ids.count <= 32,
              Set(ids).count == ids.count, ids.allSatisfy({ WidgetContract.isHex($0, length: 32) }) else {
            throw WidgetFailure.storageUnavailable
        }
        return ids
    }
    private func writeIDs(_ ids: [String]) throws {
        do { try JSONEncoder().encode(ids).write(to: indexURL, options: [.atomic, .completeFileProtection]) }
        catch { throw WidgetFailure.storageUnavailable }
    }
    private func cacheURL(_ id: String) throws -> URL {
        guard WidgetContract.isHex(id, length: 32) else { throw WidgetFailure.storageUnavailable }
        return directory.appendingPathComponent("\(id).sealed")
    }
    private func rawGrant(_ id: String) throws -> WidgetGrant? {
        guard let data = try vault.read(id) else { return nil }
        guard data.count <= 4096, let grant = try? JSONDecoder().decode(WidgetGrant.self, from: data), grant.id == id,
              WidgetContract.isHex(grant.token, length: 64) else { throw WidgetFailure.storageUnavailable }
        return grant
    }
    func grants(now: Date = Date()) throws -> [WidgetGrant] {
        try locked {
            var result: [WidgetGrant] = []
            for id in try readIDs() {
                if let grant = try rawGrant(id), grant.isUsable(at: now) { result.append(grant) }
            }
            return result
        }
    }
    func grant(_ id: String, now: Date = Date()) throws -> WidgetGrant? {
        guard WidgetContract.isHex(id, length: 32) else { return nil }
        return try locked {
            guard try readIDs().contains(id), let grant = try rawGrant(id), grant.isUsable(at: now) else { return nil }
            return grant
        }
    }
    func add(_ grant: WidgetGrant, now: Date = Date()) throws {
        guard grant.isUsable(at: now) else { throw WidgetFailure.accessDenied }
        try locked {
            var ids = try readIDs()
            // Remove expired local credentials before applying the same 32-source cap.
            for id in ids {
                if try rawGrant(id)?.isUsable(at: now) != true {
                    try vault.remove(id); try? files.removeItem(at: cacheURL(id)); ids.removeAll { $0 == id }
                }
            }
            guard ids.contains(grant.id) || ids.count < 32 else { throw WidgetFailure.storageUnavailable }
            if !ids.contains(grant.id) { ids.append(grant.id) }
            do {
                try vault.write(JSONEncoder().encode(grant), account: grant.id)
                try writeIDs(ids)
            } catch {
                try? vault.remove(grant.id)
                throw WidgetFailure.storageUnavailable
            }
        }
    }
    func remove(_ id: String) throws {
        guard WidgetContract.isHex(id, length: 32) else { return }
        try locked {
            var ids = try readIDs()
            try vault.remove(id) // Remove authority first, even if a file operation later fails.
            try? files.removeItem(at: cacheURL(id))
            ids.removeAll { $0 == id }
            try writeIDs(ids)
        }
    }
    private func encryptionKey(create: Bool) throws -> SymmetricKey? {
        if let data = try vault.read(encryptionAccount) {
            guard data.count == 32 else { throw WidgetFailure.storageUnavailable }
            return SymmetricKey(data: data)
        }
        guard create else { return nil }
        let key = SymmetricKey(size: .bits256)
        try vault.write(key.withUnsafeBytes { Data($0) }, account: encryptionAccount)
        return key
    }
    func save(_ snapshot: WidgetSnapshot, for grant: WidgetGrant, now: Date = Date()) throws {
        try snapshot.validate(for: grant.id, now: now)
        try locked {
            guard try readIDs().contains(grant.id), let current = try rawGrant(grant.id), current == grant,
                  current.isUsable(at: now), let key = try encryptionKey(create: true) else { throw WidgetFailure.accessDenied }
            let envelope = CachedWidgetSnapshot(snapshot: snapshot, fetchedAt: now, expiresAt: grant.expiresAt)
            let data = try JSONEncoder().encode(envelope)
            guard let sealed = try AES.GCM.seal(data, using: key).combined else { throw WidgetFailure.storageUnavailable }
            do { try sealed.write(to: cacheURL(grant.id), options: [.atomic, .completeFileProtection]) }
            catch { throw WidgetFailure.storageUnavailable }
        }
    }
    func cached(for grant: WidgetGrant, now: Date = Date()) throws -> CachedWidgetSnapshot? {
        try locked {
            guard try readIDs().contains(grant.id), let current = try rawGrant(grant.id), current == grant,
                  current.isUsable(at: now) else { return nil }
            let url = try cacheURL(grant.id)
            guard files.fileExists(atPath: url.path), let key = try encryptionKey(create: false) else { return nil }
            guard let sealed = try? Data(contentsOf: url), sealed.count <= 32768,
                  let box = try? AES.GCM.SealedBox(combined: sealed), let data = try? AES.GCM.open(box, using: key),
                  let envelope = try? JSONDecoder().decode(CachedWidgetSnapshot.self, from: data),
                  envelope.isUsable(for: grant, now: now) else {
                try? files.removeItem(at: url)
                return nil
            }
            return envelope
        }
    }
}
