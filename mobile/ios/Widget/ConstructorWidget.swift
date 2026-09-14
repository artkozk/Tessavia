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
            WidgetSourceEntity(id: grant.id, title: try store.cached(for: grant)?.snapshot.title ?? "Источник \(grant.id.prefix(6))")
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
                        message: failure == .rateLimited ? "Обновим позже · сохранённая копия" : "Нет связи · сохранённая копия")
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
    private var itemLimit: Int { family == .systemLarge ? 5 : family == .systemMedium ? 2 : 0 }
    var body: some View {
        VStack(alignment: .leading, spacing: family == .systemSmall ? 8 : 10) {
            Text("TESSAVIE").font(.caption2.weight(.semibold)).tracking(1).foregroundStyle(TessavieTheme.accent(scheme))
            if let cache = entry.cache {
                let snapshot = cache.snapshot
                Text(snapshot.title).font(.headline).lineLimit(2).privacySensitive()
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Text("\(snapshot.completed)").font(family == .systemSmall ? .title.bold() : .largeTitle.bold())
                        .foregroundStyle(TessavieTheme.accent(scheme))
                    Text("из \(snapshot.total)").font(.subheadline).foregroundStyle(.secondary)
                }.accessibilityElement(children: .ignore).accessibilityLabel("Выполнено \(snapshot.completed) из \(snapshot.total)").privacySensitive()
                ProgressView(value: Double(snapshot.completed), total: Double(max(1, snapshot.total)))
                    .tint(TessavieTheme.accent(scheme)).privacySensitive()
                if itemLimit > 0 {
                    ForEach(Array(snapshot.items.prefix(itemLimit).enumerated()), id: \.offset) { _, item in
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: item.checked ? "checkmark.circle.fill" : "circle").foregroundStyle(TessavieTheme.accent(scheme))
                            Text(item.label).font(.subheadline).lineLimit(1)
                        }.privacySensitive().accessibilityElement(children: .combine)
                    }
                }
                Spacer(minLength: 0)
                VStack(alignment: .leading, spacing: 2) {
                    if !entry.message.isEmpty { Text(entry.message).lineLimit(2) }
                    Text(cache.fetchedAt, format: .dateTime.day().month(.abbreviated).hour().minute())
                }.font(.caption2).foregroundStyle(.secondary)
            } else {
                Text("Ваш виджет").font(.headline)
                Text(entry.message).font(.subheadline).foregroundStyle(.secondary).lineLimit(family == .systemSmall ? 5 : 7)
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
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
