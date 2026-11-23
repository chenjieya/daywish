import Foundation

/// 公历日运算固定于 UTC；“今天”在界面层按用户本地时区提取，跨时区不改变中国节日的公历日期。
public struct DateEngine {
    public let data: CalendarData
    public let springs: SpringData
    private var gregorian: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }
    public init() throws {
        data = try SharedResources.decode("calendar", as: CalendarData.self)
        springs = try SharedResources.decode("springs", as: SpringData.self)
        guard data.schemaVersion == 1 else { throw DataError.unsupportedCalendar }
    }
    public init(data: CalendarData, springs: SpringData) { self.data = data; self.springs = springs }
    public func date(_ key: String) -> Date {
        let parts = key.split(separator: "-").compactMap { Int($0) }
        precondition(parts.count == 3, "日期必须为 YYYY-MM-DD")
        return gregorian.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))!
    }
    public func key(_ date: Date) -> String {
        let parts = gregorian.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year!, parts.month!, parts.day!)
    }
    public func addDays(_ key: String, _ count: Int) -> String { self.key(gregorian.date(byAdding: .day, value: count, to: date(key))!) }
    public func days(_ from: String, _ to: String) -> Int { gregorian.dateComponents([.day], from: date(from), to: date(to)).day! }
    public func isWorkingDay(_ key: String) -> Bool {
        if data.workdays.contains(key) { return true }
        if data.holidays.contains(where: { $0.start <= key && key <= $0.end }) { return false }
        let weekday = gregorian.component(.weekday, from: date(key))
        return weekday != 1 && weekday != 7
    }
    private func paydayCandidates(today: String, preferences p: Preferences) -> [Countdown] {
        let current = date(today)
        let components = gregorian.dateComponents([.year, .month], from: current)
        let first = gregorian.date(from: components)!
        var candidates: [Countdown] = []
        for offset in -2...2 {
            let month = gregorian.date(byAdding: .month, value: offset, to: first)!
            let lastDay = gregorian.range(of: .day, in: .month, for: month)!.count
            let day = p.payday == 0 ? lastDay : min(p.payday, lastDay)
            let nominal = key(gregorian.date(byAdding: .day, value: day - 1, to: month)!)
            var actual = nominal
            var estimated = false
            if p.paydayRule != .exact {
                let direction = p.paydayRule == .previous ? -1 : 1
                for _ in 0..<31 {
                    let year = gregorian.component(.year, from: date(actual))
                    guard data.sources.contains(where: { $0.year == year }) else { actual = nominal; estimated = true; break }
                    if isWorkingDay(actual) { break }
                    actual = addDays(actual, direction)
                }
            }
            let note: String
            if estimated { note = "该年调休待更新，暂按约定日" }
            else if actual != nominal { note = "由\(Self.shortDate(nominal))\(p.paydayRule == .previous ? "提前" : "顺延")" }
            else { note = p.payday == 0 ? "每月最后一天" : "每月 \(p.payday) 日" }
            candidates.append(Countdown(date: actual, days: days(today, actual), note: note))
        }
        return candidates.sorted(by: { $0.date < $1.date })
    }
    public func nextPayday(today: String, preferences: Preferences) throws -> Countdown {
        guard let next = paydayCandidates(today: today, preferences: preferences).first(where: { $0.date >= today }) else { throw DataError.noPayday }
        return next
    }
    public func nextHoliday(today: String) -> HolidayCountdown? {
        guard let holiday = data.holidays.sorted(by: { $0.start < $1.start }).first(where: { $0.end >= today }) else { return nil }
        return HolidayCountdown(holiday: holiday, days: max(0, days(today, holiday.start)), length: days(holiday.start, holiday.end) + 1, ongoing: holiday.start <= today)
    }
    public func nextSpring(today: String) -> Countdown? {
        guard let spring = springs.dates.first(where: { $0.date >= today }) else { return nil }
        return Countdown(date: spring.date, days: days(today, spring.date), note: "\(spring.date.prefix(4)) 年 · 正月初一")
    }
    public static func shortDate(_ key: String) -> String {
        let parts = key.split(separator: "-")
        guard parts.count == 3, let month = Int(parts[1]), let day = Int(parts[2]) else { return key }
        return "\(month)月\(day)日"
    }
    public static func selectedZone(_ mode: TimeZoneMode) -> TimeZone { mode == .beijing ? TimeZone(identifier: "Asia/Shanghai")! : .current }
    public static func localToday(_ date: Date = Date(), mode: TimeZoneMode = .beijing) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = selectedZone(mode)
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", components.year!, components.month!, components.day!)
    }
    public func cycleProgress(start: String?, end: String, today: String) -> Double? {
        if today >= end { return 100 }
        guard let start, start < end else { return nil }
        return min(100, max(0, Double(days(start, today)) / Double(days(start, end)) * 100))
    }
    public func paydayProgress(today: String, preferences: Preferences) -> Double? {
        let candidates = paydayCandidates(today: today, preferences: preferences)
        guard let next = candidates.first(where: { $0.date >= today }) else { return nil }
        return cycleProgress(start: candidates.last(where: { $0.date < today })?.date, end: next.date, today: today)
    }
    public func holidayProgress(today: String) -> Double? {
        guard let next = nextHoliday(today: today) else { return nil }
        if next.ongoing { return 100 }
        let previous = data.holidays.filter { $0.end < today }.sorted { $0.end < $1.end }.last
        return cycleProgress(start: previous.map { addDays($0.end, 1) }, end: next.holiday.start, today: today)
    }
    public func springProgress(today: String) -> Double? {
        guard let next = nextSpring(today: today) else { return nil }
        return cycleProgress(start: springs.dates.last(where: { $0.date < today })?.date, end: next.date, today: today)
    }
}
