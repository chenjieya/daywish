import Foundation

public enum PaydayRule: String, Codable, CaseIterable { case exact, previous, next }
public enum Theme: String, Codable, CaseIterable { case dawn, forest, night }
public enum TimeZoneMode: String, Codable { case beijing, system }

public struct Preferences: Codable, Equatable {
    public var payday = 10
    public var paydayRule: PaydayRule = .exact
    public var opacity = 0.0
    public var theme: Theme = .dawn
    public var alwaysOnTop = false
    public var launchAtLogin = false
    public var compact = false
    public var timeZone: TimeZoneMode = .beijing
    public var autoUpdate = true
    public init() {}
    private enum CodingKeys: String, CodingKey { case payday, paydayRule, opacity, theme, alwaysOnTop, launchAtLogin, compact, timeZone, autoUpdate }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        payday = (try? c.decode(Int.self, forKey: .payday)) ?? 10
        paydayRule = (try? c.decode(PaydayRule.self, forKey: .paydayRule)) ?? .exact
        opacity = (try? c.decode(Double.self, forKey: .opacity)) ?? 0
        theme = (try? c.decode(Theme.self, forKey: .theme)) ?? .dawn
        alwaysOnTop = (try? c.decode(Bool.self, forKey: .alwaysOnTop)) ?? false
        launchAtLogin = (try? c.decode(Bool.self, forKey: .launchAtLogin)) ?? false
        compact = (try? c.decode(Bool.self, forKey: .compact)) ?? false
        timeZone = (try? c.decode(TimeZoneMode.self, forKey: .timeZone)) ?? .beijing
        autoUpdate = (try? c.decode(Bool.self, forKey: .autoUpdate)) ?? true
    }

    public func validated() -> Preferences {
        var copy = self
        if !(0...31).contains(copy.payday) { copy.payday = 10 }
        copy.opacity = copy.opacity.isFinite ? min(95, max(0, copy.opacity)) : 0
        return copy
    }
}
public struct Holiday: Codable, Identifiable {
    public let name: String
    public let start: String
    public let end: String
    public var id: String { start }
}
public struct CalendarSource: Codable { public let year: Int; public let url: String; public let document: String }
public struct CalendarData: Codable {
    public let schemaVersion: Int
    public let region: String
    public let updatedAt: String
    public let sources: [CalendarSource]
    public let holidays: [Holiday]
    public let workdays: [String]
}
public struct SpringDate: Codable { public let date: String; public let source: String }
public struct SpringData: Codable { public let source: String; public let dates: [SpringDate] }
public struct Countdown {
    public let date: String
    public let days: Int
    public let note: String
}
public struct HolidayCountdown {
    public let holiday: Holiday
    public let days: Int
    public let length: Int
    public let ongoing: Bool
}
public enum DataError: Error { case missingResource(String), unsupportedCalendar, noPayday }

public enum SharedResources {
    public static func decode<T: Decodable>(_ name: String, as type: T.Type) throws -> T {
        let appResource = Bundle.main.url(forResource: "Daywish_DaywishCore", withExtension: "bundle").flatMap { Bundle(url: $0) }
        let bundle = appResource ?? Bundle.module
        guard let url = bundle.url(forResource: name, withExtension: "json") else { throw DataError.missingResource(name) }
        return try JSONDecoder().decode(type, from: Data(contentsOf: url))
    }
}
