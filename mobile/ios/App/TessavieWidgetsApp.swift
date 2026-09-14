import SwiftUI
import WidgetKit

struct WidgetConnectionSummary: Identifiable {
    let id: String
    let title: String
    let detail: String
    let expiresAt: Date
}

@MainActor final class CompanionModel: ObservableObject {
    @Published var connections: [WidgetConnectionSummary] = []
    @Published var busy = false
    @Published var message = ""
    @Published var failed = false
    func reload() {
        do {
            let store = try WidgetStore.shared()
            connections = try store.grants().map { grant in
                let cache = try store.cached(for: grant)
                return WidgetConnectionSummary(id: grant.id, title: cache?.snapshot.title ?? "Источник подключён",
                    detail: cache.map { "\($0.snapshot.completed) из \($0.snapshot.total) · обновлено \($0.fetchedAt.formatted(date: .abbreviated, time: .shortened))" } ?? "Данные ещё не получены",
                    expiresAt: grant.expiresAt)
            }
        } catch { connections = []; report(.storageUnavailable) }
    }
    private func report(_ failure: WidgetFailure) { failed = true; message = failure.errorDescription ?? "Не удалось выполнить действие" }
    func connect(_ code: String) async {
        guard !busy else { return }
        busy = true; message = ""; failed = false
        defer { busy = false }
        do {
            let store = try WidgetStore.shared() // Verify entitlement/storage before consuming a code.
            _ = try store.grants()
            let api = WidgetAPI()
            let grant = try await api.redeem(code: code)
            do { try store.add(grant) }
            catch { report(.storageUnavailable); message += " Код уже использован: отключите этот доступ на сайте и создайте новый."; return }
            do { try store.save(await api.snapshot(for: grant), for: grant) }
            catch let error as WidgetFailure {
                if error == .accessDenied { try? store.remove(grant.id); throw error }
                message = "Источник подключён. Данные появятся после успешного обновления."
            }
            reload(); WidgetCenter.shared.reloadTimelines(ofKind: WidgetContract.widgetKind)
            if message.isEmpty { message = "Источник подключён. Добавьте виджет Tessavie на экран «Домой» и выберите этот источник." }
        } catch let failure as WidgetFailure { report(failure) }
        catch { report(.unavailable) }
    }
    func refresh() async {
        guard !busy else { return }
        busy = true; message = ""; failed = false
        defer { busy = false; reload(); WidgetCenter.shared.reloadTimelines(ofKind: WidgetContract.widgetKind) }
        do {
            let store = try WidgetStore.shared()
            for grant in try store.grants() {
                do { try store.save(await WidgetAPI().snapshot(for: grant), for: grant) }
                catch let failure as WidgetFailure {
                    if failure == .accessDenied { try? store.remove(grant.id) }
                    report(failure)
                }
            }
            if message.isEmpty { message = "Данные обновлены. Время обновления виджета определяет iOS." }
        } catch { report(.storageUnavailable) }
    }
    func disconnect(_ id: String) {
        do {
            try WidgetStore.shared().remove(id)
            message = "Данные удалены с телефона. Серверный доступ можно отключить в настройках сайта."
            failed = false; reload(); WidgetCenter.shared.reloadTimelines(ofKind: WidgetContract.widgetKind)
        } catch { report(.storageUnavailable) }
    }
}

@main struct TessavieWidgetsApp: App {
    var body: some Scene { WindowGroup { CompanionView() } }
}

struct CompanionView: View {
    @StateObject private var model = CompanionModel()
    @State private var code = ""
    @State private var removing: String?
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var phase
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Ваши блоки — рядом").font(.largeTitle.bold())
                        Text("Подключите выбранный блок конструктора и добавьте его на экран «Домой».").foregroundStyle(.secondary)
                        Link("Открыть Tessavie", destination: WidgetContract.website).font(.headline)
                    }
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Подключить источник").font(.title2.bold())
                        Text("На сайте откройте Настройки → На телефоне → Виджеты. Выберите свою страницу и блок, затем создайте код.")
                        SecureField("Код подключения", text: $code)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                            .textContentType(.oneTimeCode).textFieldStyle(.roundedBorder).privacySensitive()
                            .disabled(model.busy)
                        Button {
                            let pending = code.trimmingCharacters(in: .whitespacesAndNewlines)
                            code = "" // Never persist/repopulate a one-time pairing secret.
                            Task { await model.connect(pending) }
                        } label: {
                            HStack { if model.busy { ProgressView().tint(.white) }; Text("Подключить виджет").bold() }
                                .frame(maxWidth: .infinity).padding(.vertical, 7)
                        }.buttonStyle(.borderedProminent).disabled(model.busy || !WidgetContract.isHex(code.trimmingCharacters(in: .whitespacesAndNewlines), length: 32))
                        Text("Код действует 5 минут. Пароль от сайта здесь не нужен. Подключение разрешает чтение одного блока на 90 дней; доступ можно отозвать на сайте.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    if !model.message.isEmpty {
                        Label(model.message, systemImage: model.failed ? "exclamationmark.circle" : "checkmark.circle")
                            .font(.callout).foregroundStyle(model.failed ? Color.orange : TessavieTheme.accent(scheme))
                            .accessibilityAddTraits(.updatesFrequently)
                    }
                    if !model.connections.isEmpty {
                        VStack(alignment: .leading, spacing: 16) {
                            HStack {
                                Text("Подключённые источники").font(.title2.bold())
                                Spacer()
                                Button { Task { await model.refresh() } } label: { Image(systemName: "arrow.clockwise").padding(10) }
                                    .accessibilityLabel("Обновить источники").disabled(model.busy)
                            }
                            ForEach(model.connections) { source in
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(source.title).font(.headline).privacySensitive()
                                    Text(source.detail).font(.subheadline).foregroundStyle(.secondary).privacySensitive()
                                    Text("Доступ до \(source.expiresAt.formatted(date: .abbreviated, time: .omitted))").font(.caption).foregroundStyle(.secondary)
                                    Button("Убрать с телефона", role: .destructive) { removing = source.id }.disabled(model.busy)
                                }
                                Divider()
                            }
                        }
                    }
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Добавить на экран").font(.title2.bold())
                        Text("1. Удерживайте свободное место на экране «Домой».\n2. Нажмите «Изменить» / «Добавить виджет» и найдите Tessavie.\n3. Выберите размер. Удерживайте добавленный виджет → «Изменить виджет» → выберите источник.")
                        Text("Виджет показывает данные, а нажатие открывает сайт. iOS сама выбирает время фонового обновления. При отсутствии сети показана последняя копия с датой, максимум за 24 часа.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }.padding(24)
            }
            .background(TessavieTheme.background(scheme)).navigationTitle("Tessavie Widgets")
            .navigationBarTitleDisplayMode(.inline).tint(TessavieTheme.accent(scheme))
            .task { model.reload() }
            .onChange(of: phase) { _, current in if current == .active { model.reload() } else { code = "" } }
            .confirmationDialog("Убрать источник с телефона?", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } })) {
                Button("Удалить локальные данные", role: .destructive) { if let id = removing { model.disconnect(id) }; removing = nil }
            } message: { Text("Локальный токен и копия данных будут удалены. Для отзыва серверного доступа откройте настройки виджетов на сайте.") }
        }
    }
}
