import SwiftUI
import WidgetKit

struct CalendarEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
}

struct CalendarProvider: TimelineProvider {
    func placeholder(in context: Context) -> CalendarEntry { CalendarEntry(date: Date(), snapshot: .empty) }
    func getSnapshot(in context: Context, completion: @escaping (CalendarEntry) -> Void) {
        completion(CalendarEntry(date: Date(), snapshot: WidgetStore.read()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<CalendarEntry>) -> Void) {
        let now = Date(), snapshot = WidgetStore.read()
        // Prebuilt entries let dates and expired dots change even while the app is closed.
        let start = now.timeIntervalSince1970, end = start + 6 * 3600
        let regular = (0..<25).map { start + Double($0) * 900 }
        let endings = snapshot.days.flatMap(\.items).filter { !$0.todo }.map { $0.endsAt / 1000 }.filter { $0 > start && $0 < end }
        let entries = Array(Set(regular + endings)).sorted().prefix(100).map {
            CalendarEntry(date: Date(timeIntervalSince1970: $0), snapshot: snapshot)
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

@main
struct MemoryEveryDayCalendarWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MemoryEveryDayCalendar", provider: CalendarProvider()) { entry in
            CalendarWidgetView(entry: entry)
                .containerBackground(Color(red: 0.955, green: 0.98, blue: 1), for: .widget)
                .widgetURL(URL(string: "memoryeveryday://calendar"))
        }
        .configurationDisplayName("月历与今日安排")
        .description("左侧看整月，右侧看今天。打开每日备忘后更新安排。")
        .supportedFamilies([.systemLarge])
        .contentMarginsDisabled()
    }
}

struct CalendarWidgetView: View {
    let entry: CalendarEntry
    private let ink = Color(red: 0.10, green: 0.22, blue: 0.33)
    private let muted = Color(red: 0.43, green: 0.55, blue: 0.65)
    private let blue = Color(red: 0.15, green: 0.51, blue: 0.77)
    private var calendar: Calendar { Calendar(identifier: .gregorian) }
    private var todayItems: [WidgetItem] { entry.snapshot.items(on: entry.date) }
    private var available: Bool { entry.snapshot.days.contains { $0.date == WidgetSnapshot.key(entry.date) } }
    private var visibleItems: [WidgetItem] {
        let upcoming = todayItems.filter { $0.todo || $0.endsAt > entry.date.timeIntervalSince1970 * 1000 }
        return upcoming.isEmpty ? Array(todayItems.suffix(3)) : Array(upcoming.prefix(3))
    }
    private func color(_ name: String) -> Color {
        switch name {
        case "mint", "teal", "green": return Color(red: 0.21, green: 0.65, blue: 0.61)
        case "cyan": return Color(red: 0.18, green: 0.70, blue: 0.84)
        case "navy": return Color(red: 0.20, green: 0.40, blue: 0.65)
        case "purple": return Color(red: 0.51, green: 0.43, blue: 0.76)
        case "pink": return Color(red: 0.85, green: 0.46, blue: 0.61)
        case "orange": return Color(red: 0.90, green: 0.61, blue: 0.28)
        case "red": return .red
        default: return blue
        }
    }
    private var monthDates: [Date] {
        let first = calendar.date(from: calendar.dateComponents([.year, .month], from: entry.date))!
        let start = calendar.date(byAdding: .day, value: 1 - calendar.component(.weekday, from: first), to: first)!
        return (0..<42).map { calendar.date(byAdding: .day, value: $0, to: start)! }
    }
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                Image(systemName: "calendar.badge.clock").font(.system(size: 16, weight: .semibold)).foregroundStyle(blue)
                Text("每日备忘").font(.system(size: 15, weight: .bold))
                Spacer(minLength: 0)
                Text("月历 · 今天").font(.system(size: 10, weight: .medium)).foregroundStyle(muted)
            }.padding(.horizontal, 14).padding(.vertical, 12)
            Divider().overlay(blue.opacity(0.08))
            HStack(alignment: .top, spacing: 0) {
                month.padding(.leading, 12).padding(.trailing, 9).frame(maxWidth: .infinity)
                Rectangle().fill(blue.opacity(0.16)).frame(width: 1)
                agenda.padding(.horizontal, 11).frame(maxWidth: .infinity)
            }.padding(.top, 12).padding(.bottom, 8)
            Divider().overlay(blue.opacity(0.08))
            HStack(spacing: 4) {
                Circle().fill(entry.snapshot.updatedAt > 0 ? Color.teal : muted).frame(width: 5, height: 5)
                Text(status).lineLimit(1)
                Spacer(minLength: 2)
                Image(systemName: "arrow.up.forward").font(.system(size: 9, weight: .bold))
            }.font(.system(size: 9)).foregroundStyle(muted).padding(.horizontal, 14).padding(.vertical, 9)
        }.foregroundStyle(ink)
    }
    private var status: String {
        if !entry.snapshot.signedIn { return "打开每日备忘并登录，显示你的安排" }
        if !available { return "打开每日备忘，更新小组件内容" }
        let date = Date(timeIntervalSince1970: entry.snapshot.updatedAt / 1000)
        let formatter = DateFormatter(); formatter.dateFormat = calendar.isDate(date, inSameDayAs: entry.date) ? "HH:mm" : "M/d HH:mm"
        return "更新于 \(formatter.string(from: date)) · 点击查看"
    }
    private var month: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text("\(String(calendar.component(.year, from: entry.date)))年\(calendar.component(.month, from: entry.date))月")
                .font(.system(size: 17, weight: .bold)).minimumScaleFactor(0.8).lineLimit(1)
            HStack(spacing: 0) {
                ForEach(Array(["日", "一", "二", "三", "四", "五", "六"].enumerated()), id: \.offset) { _, day in
                    Text(day).font(.system(size: 9, weight: .semibold)).foregroundStyle(muted).frame(maxWidth: .infinity)
                }
            }
            GeometryReader { proxy in
                let height = max(19, (proxy.size.height - 15) / 6)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 7), spacing: 3) {
                    ForEach(monthDates, id: \.self) { date in
                        let selected = calendar.isDate(date, inSameDayAs: entry.date)
                        let inMonth = calendar.component(.month, from: date) == calendar.component(.month, from: entry.date)
                        let items = entry.snapshot.items(on: date).filter { $0.todo || $0.endsAt > entry.date.timeIntervalSince1970 * 1000 }
                        VStack(spacing: 3) {
                            Text("\(calendar.component(.day, from: date))").font(.system(size: 11, weight: selected ? .bold : .semibold))
                                .foregroundStyle(selected ? .white : ink.opacity(inMonth ? 1 : 0.35))
                            HStack(spacing: 1) {
                                ForEach(Array(items.prefix(3).enumerated()), id: \.offset) { _, item in
                                    Circle().fill(selected ? .white.opacity(0.9) : color(item.color)).frame(width: 3, height: 3)
                                }
                                if items.count > 3 { Text("+").font(.system(size: 5, weight: .bold)) }
                            }.frame(height: 3)
                        }.frame(maxWidth: .infinity).frame(height: height)
                            .background(selected ? blue : Color.white.opacity(inMonth ? 0.8 : 0.3), in: RoundedRectangle(cornerRadius: 5))
                    }
                }
            }
            HStack(spacing: 4) {
                Circle().fill(blue).frame(width: 4, height: 4)
                Text("未结束日程 · 未完成待办").font(.system(size: 8)).foregroundStyle(muted).lineLimit(1).minimumScaleFactor(0.8)
            }
        }
    }
    private var agenda: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text("\(calendar.component(.month, from: entry.date))月\(calendar.component(.day, from: entry.date))日")
                .font(.system(size: 17, weight: .bold)).lineLimit(1)
            Text("星期\(["日", "一", "二", "三", "四", "五", "六"][calendar.component(.weekday, from: entry.date) - 1]) · \(todayItems.count) 项安排")
                .font(.system(size: 9, weight: .medium)).foregroundStyle(muted).lineLimit(1)
            if !entry.snapshot.signedIn || !available {
                emptyAgenda("打开应用", detail: "同步你的日程与待办")
            } else if todayItems.isEmpty {
                emptyAgenda("今天暂无安排", detail: "留一点时间给自己")
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(visibleItems) { item in
                        HStack(alignment: .top, spacing: 6) {
                            RoundedRectangle(cornerRadius: 2).fill(color(item.color)).frame(width: 3)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(item.todo ? "待办 · \(item.time)" : item.endTime.isEmpty ? item.time : "\(item.time)–\(item.endTime)")
                                    .font(.system(size: 9, weight: .medium)).foregroundStyle(muted).lineLimit(1)
                                Text(item.title).font(.system(size: 12, weight: .semibold)).lineLimit(2)
                                    .strikethrough(!item.todo && item.endsAt <= entry.date.timeIntervalSince1970 * 1000)
                                    .opacity(!item.todo && item.endsAt <= entry.date.timeIntervalSince1970 * 1000 ? 0.55 : 1)
                            }
                            Spacer(minLength: 0)
                        }.fixedSize(horizontal: false, vertical: true)
                    }
                }
                if todayItems.count > visibleItems.count {
                    Text("打开查看全部 \(todayItems.count) 项").font(.system(size: 9)).foregroundStyle(blue)
                }
                Spacer(minLength: 0)
            }
        }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
    private func emptyAgenda(_ title: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            ForEach(0..<3) { _ in Rectangle().fill(blue.opacity(0.10)).frame(height: 1).padding(.top, 13) }
            Text(title).font(.system(size: 11, weight: .medium))
            Text(detail).font(.system(size: 9)).foregroundStyle(muted)
            Spacer(minLength: 0)
        }
    }
}
