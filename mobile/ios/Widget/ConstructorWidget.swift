import AppIntents
import SwiftUI
import WidgetKit

struct WidgetSourceEntity: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Источник Tessavie"
    static var defaultQuery = WidgetSourceQuery()
    let id: String
    let title: String
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(title)") }
}

struct WidgetSourceQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [WidgetSourceEntity] {
        try available().filter { identifiers.contains($0.id) }
    }
    func suggestedEntities() async throws -> [WidgetSourceEntity] { try available() }
    func defaultResult() async -> WidgetSourceEntity? { try? available().first }
    private func available() throws -> [WidgetSourceEntity] {
        let store = try WidgetStore.shared()
        return try store.grants().map { grant in
            WidgetSourceEntity(id: grant.id, title: grant.displayTitle(snapshotTitle: try store.cached(for: grant)?.snapshot.title))
        }
    }
}

struct WidgetSourceIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Источник виджета"
    static var description = IntentDescription("Выберите блок, подключённый в приложении Tessavie Widgets.")
    @Parameter(title: "Источник") var source: WidgetSourceEntity?
}

struct ConstructorEntry: TimelineEntry {
    let date: Date
    let cache: CachedWidgetSnapshot?
    let message: String
}

struct ConstructorProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> ConstructorEntry {
        ConstructorEntry(date: Date(), cache: nil, message: "Ваш блок конструктора")
    }
    func snapshot(for configuration: WidgetSourceIntent, in context: Context) async -> ConstructorEntry {
        if context.isPreview { return placeholder(in: context) }
        return await load(configuration, fetch: false)
    }
    func timeline(for configuration: WidgetSourceIntent, in context: Context) async -> Timeline<ConstructorEntry> {
        let entry = await load(configuration, fetch: true)
        var entries = [entry]
        var refresh = entry.date.addingTimeInterval(WidgetContract.refreshInterval)
        if let cache = entry.cache {
            let stale = cache.fetchedAt.addingTimeInterval(WidgetContract.refreshInterval)
            if stale > entry.date && stale < cache.hideAt {
                entries.append(ConstructorEntry(date: stale, cache: cache, message: "Последняя сохранённая копия"))
            }
            if cache.hideAt > entry.date {
                entries.append(ConstructorEntry(date: cache.hideAt, cache: nil, message: "Откройте Tessavie Widgets для обновления"))
                refresh = min(refresh, cache.hideAt)
            }
        }
        return Timeline(entries: entries.sorted { $0.date < $1.date }, policy: .after(refresh))
    }
    private func load(_ configuration: WidgetSourceIntent, fetch: Bool) async -> ConstructorEntry {
        let now = Date()
        guard let id = configuration.source?.id else {
            return ConstructorEntry(date: now, cache: nil, message: "Подключите блок в Tessavie Widgets и выберите его в настройках виджета")
        }
        do {
            let store = try WidgetStore.shared()
            guard let grant = try store.grant(id, now: now) else {
                try? store.remove(id)
                return ConstructorEntry(date: now, cache: nil, message: "Подключите источник заново в Tessavie Widgets")
            }
            if fetch {
                do {
                    let snapshot = try await WidgetAPI().snapshot(for: grant)
                    try store.save(snapshot, for: grant)
                } catch let failure as WidgetFailure {
                    if failure == .accessDenied {
                        try? store.remove(id)
                        return ConstructorEntry(date: Date(), cache: nil, message: "Доступ отключён. Подключите источник заново")
                    }
                    return ConstructorEntry(date: Date(), cache: try store.cached(for: grant),
                        message: failure == .rateLimited ? "Обновим позже · сохранённая копия" : "Не удалось обновить · сохранённая копия")
                }
            }
            let cache = try store.cached(for: grant)
            return ConstructorEntry(date: Date(), cache: cache, message: cache == nil ? "Откройте приложение для первого обновления" : "")
        } catch {
            return ConstructorEntry(date: Date(), cache: nil, message: "Разблокируйте телефон и откройте Tessavie Widgets")
        }
    }
}

struct ConstructorWidgetView: View {
    let entry: ConstructorEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var scheme
    private var size: WidgetContentSize { family == .systemLarge ? .large : family == .systemMedium ? .medium : .small }
    var body: some View {
        ConstructorWidgetContent(cache: entry.cache, message: entry.message, size: size)
            .containerBackground(for: .widget) { TessavieTheme.background(scheme) }
            .widgetURL(WidgetContract.website)
    }
}

struct ConstructorWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: WidgetContract.widgetKind, intent: WidgetSourceIntent.self, provider: ConstructorProvider()) { entry in
            ConstructorWidgetView(entry: entry)
        }
        .configurationDisplayName("Блок Tessavie")
        .description("Отметки и прогресс выбранного блока конструктора. Нажатие открывает сайт.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

@main struct TessavieWidgetBundle: WidgetBundle {
    var body: some Widget { ConstructorWidget() }
}
