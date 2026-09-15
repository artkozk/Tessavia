import SwiftUI

enum WidgetContentSize { case small, medium, large }

// The extension and simulator appearance tests render exactly this view.
// Medium widgets use two columns so checklist rows cannot squeeze out the date.
struct ConstructorWidgetContent: View {
    let cache: CachedWidgetSnapshot?
    let message: String
    let size: WidgetContentSize
    @Environment(\.colorScheme) private var scheme
    private var compact: Bool { size == .small }
    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 5 : 8) {
            Text("TESSAVIE").font(.system(size: 10, weight: .semibold)).tracking(1)
                .foregroundStyle(TessavieTheme.accent(scheme))
            if let cache {
                if size == .medium && !cache.snapshot.items.isEmpty {
                    HStack(alignment: .top, spacing: 18) {
                        summary(cache.snapshot).frame(maxWidth: .infinity, alignment: .leading)
                        VStack(alignment: .leading, spacing: 12) {
                            items(cache.snapshot, limit: 2, lineLimit: 2)
                        }.frame(maxWidth: .infinity, alignment: .leading).padding(.top, 2)
                    }
                } else {
                    summary(cache.snapshot)
                    if size == .large {
                        VStack(alignment: .leading, spacing: 12) {
                            items(cache.snapshot, limit: 5, lineLimit: 1)
                        }.padding(.top, 4)
                    }
                }
                Spacer(minLength: 0)
                footer(cache)
            } else {
                Text("Ваш виджет").font(.system(size: compact ? 15 : 18, weight: .semibold))
                Text(message).font(.system(size: compact ? 12 : 14)).foregroundStyle(.secondary)
                    .lineLimit(compact ? 5 : 7)
                Spacer(minLength: 0)
            }
        }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
    private func summary(_ snapshot: WidgetSnapshot) -> some View {
        VStack(alignment: .leading, spacing: compact ? 4 : size == .medium ? 5 : 6) {
            Text(snapshot.title).font(.system(size: compact ? 14 : size == .medium ? 15 : 17, weight: .semibold))
                .lineLimit(2).privacySensitive()
            HStack(alignment: .firstTextBaseline, spacing: 5) {
                Text("\(snapshot.completed)").font(.system(size: size == .large ? 32 : 28, weight: .bold))
                    .foregroundStyle(TessavieTheme.accent(scheme))
                Text("из \(snapshot.total)").font(.system(size: compact ? 12 : 14)).foregroundStyle(.secondary)
            }.lineLimit(1).minimumScaleFactor(0.8)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Выполнено \(snapshot.completed) из \(snapshot.total)").privacySensitive()
            // Pure SwiftUI shapes render identically in WidgetKit and ImageRenderer;
            // the platform-backed ProgressView can export an unsupported-view marker.
            let fraction = min(1, max(0, Double(snapshot.completed) / Double(max(1, snapshot.total))))
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(TessavieTheme.accent(scheme).opacity(scheme == .dark ? 0.24 : 0.14))
                    Capsule().fill(TessavieTheme.accent(scheme))
                        .frame(width: geometry.size.width * CGFloat(fraction))
                }
            }.frame(height: compact ? 4 : 5)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Прогресс")
                .accessibilityValue("\(snapshot.completed) из \(snapshot.total)")
                .privacySensitive()
        }
    }
    private func items(_ snapshot: WidgetSnapshot, limit: Int, lineLimit: Int) -> some View {
        ForEach(Array(snapshot.items.prefix(limit).enumerated()), id: \.offset) { _, item in
            HStack(alignment: .top, spacing: 7) {
                Image(systemName: item.checked ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(TessavieTheme.accent(scheme)).font(.system(size: 14)).padding(.top, 1)
                Text(item.label).font(.system(size: 13)).lineLimit(lineLimit)
            }.privacySensitive().accessibilityElement(children: .combine)
        }
    }
    private func footer(_ cache: CachedWidgetSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            if !message.isEmpty {
                Text(compact ? "Сохранённая копия" : message).lineLimit(1)
                    .accessibilityLabel(message)
            }
            Text(cache.fetchedAt, format: .dateTime.day().month(.twoDigits).hour().minute())
                .lineLimit(1).minimumScaleFactor(0.8)
                .accessibilityLabel("Обновлено \(cache.fetchedAt.formatted(date: .abbreviated, time: .shortened))")
        }.font(.system(size: 10)).foregroundStyle(.secondary).layoutPriority(1)
    }
}
