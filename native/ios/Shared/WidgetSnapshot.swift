import Foundation
import WidgetKit

struct WidgetItem: Codable, Identifiable {
    let id: String
    let title: String
    let time: String
    let endTime: String
    let color: String
    let todo: Bool
    let endsAt: Double
}

struct WidgetDay: Codable {
    let date: String
    let items: [WidgetItem]
}

struct WidgetSnapshot: Codable {
    let version: Int
    let updatedAt: Double
    let signedIn: Bool
    let days: [WidgetDay]

    static let empty = WidgetSnapshot(version: 1, updatedAt: 0, signedIn: false, days: [])
    func items(on date: Date) -> [WidgetItem] { days.first { $0.date == Self.key(date) }?.items ?? [] }
    static func key(_ date: Date) -> String {
        let parts = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year!, parts.month!, parts.day!)
    }
}

enum WidgetStore {
    // SideStore/AltStore rewrite the group entitlement when signing. Use their
    // injected identifier so the app and extension still open the same container.
    static var container: URL? {
        let groups = Bundle.main.object(forInfoDictionaryKey: "ALTAppGroups") as? [String] ?? ["group.com.memoryeveryday.app"]
        guard let group = groups.first(where: { $0.contains("group.com.memoryeveryday.app") }) else { return nil }
        return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
    }
    static var file: URL? { container?.appendingPathComponent("calendar-widget.json") }
    static func read() -> WidgetSnapshot {
        guard let file, let data = try? Data(contentsOf: file), let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data), snapshot.version == 1 else { return .empty }
        return snapshot
    }
    @discardableResult static func write(_ body: [String: Any]) -> Bool {
        guard JSONSerialization.isValidJSONObject(body), let data = try? JSONSerialization.data(withJSONObject: body), data.count <= 2_000_000,
              let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data), snapshot.version == 1, snapshot.days.count <= 100, let file else { return false }
        do {
            try data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            WidgetCenter.shared.reloadTimelines(ofKind: "MemoryEveryDayCalendar")
            return true
        } catch { return false }
    }
}
