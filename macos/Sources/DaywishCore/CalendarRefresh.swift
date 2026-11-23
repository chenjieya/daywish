import Foundation

public struct CalendarCache: Codable {
    public var calendar: CalendarData
    public var springs: SpringData
    public var lastChecked: Date?
    public var lastSuccess: Date?
    public var message = "使用本地日历，可自动检查更新"
    public var failed = false
    public init(engine: DateEngine) { calendar = engine.data; springs = engine.springs }
    public var engine: DateEngine { DateEngine(data: calendar, springs: springs) }
}
public enum CalendarRefreshError: Error { case http(Int), invalidData, unpublished }

/// 使用公开索引定位官方通知，所有日期均从中国政府网原文解析；不依赖索引内的日期数据。
public enum CalendarRefresh {
    private struct Index: Decodable { let year: Int; let papers: [String] }
    private static let names = ["元旦", "春节", "清明节", "劳动节", "端午节", "中秋节", "国庆节"]
    public static func shouldCheck(now: Date = Date(), cache: CalendarCache) -> Bool {
        guard let checked = cache.lastChecked else { return true }
        let elapsed = now.timeIntervalSince(checked)
        if elapsed < 0 { return true }
        if cache.failed { return elapsed >= 86400 }
        let today = DateEngine.localToday(now)
        let year = Int(today.prefix(4)) ?? 0
        if DateEngine.localToday(checked).prefix(4) != today.prefix(4) { return true }
        return (Int(today.dropFirst(5).prefix(2)) ?? 0) >= 9 && !cache.calendar.sources.contains(where: { $0.year == year + 1 }) && elapsed >= 7 * 86400
    }
    private static func official(_ value: String) -> Bool {
        guard let url = URL(string: value), url.scheme == "https" else { return false }
        return url.host == "www.gov.cn" || url.host == "big5.www.gov.cn"
    }
    private static func load(_ value: String) async throws -> Data {
        guard let url = URL(string: value), url.scheme == "https" else { throw CalendarRefreshError.invalidData }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 12)
        request.setValue("Daywish/0.2 Calendar", forHTTPHeaderField: "User-Agent")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw CalendarRefreshError.invalidData }
        guard response.statusCode == 200 else { throw CalendarRefreshError.http(response.statusCode) }
        guard data.count <= 2_000_000 else { throw CalendarRefreshError.invalidData }
        return data
    }
    public static func refresh(year: Int, base: DateEngine) async throws -> DateEngine {
        guard (2020...2100).contains(year) else { throw CalendarRefreshError.invalidData }
        var index: Index?
        var lastError: Error = CalendarRefreshError.invalidData
        for root in ["https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master", "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master"] {
            do {
                let data = try await load("\(root)/\(year).json")
                let value = try JSONDecoder().decode(Index.self, from: data)
                guard value.year == year else { throw CalendarRefreshError.invalidData }
                index = value
                break
            } catch { lastError = error }
        }
        guard let index else {
            if let refreshError = lastError as? CalendarRefreshError, case .http(404) = refreshError { throw CalendarRefreshError.unpublished }
            throw lastError
        }
        for source in index.papers.filter({ official($0) }).prefix(3) {
            let mirror = source.replacingOccurrences(of: "https://www.gov.cn/", with: "https://big5.www.gov.cn/gate/big5/www.gov.cn/")
            for address in [source, mirror] {
                do {
                    let data = try await load(address)
                    guard let html = String(data: data, encoding: .utf8) else { throw CalendarRefreshError.invalidData }
                    let result = try parse(html: html, year: year, source: source, math: base)
                    return try merge(base: base, update: result)
                } catch { lastError = error }
            }
        }
        throw lastError
    }
    private static func captures(_ pattern: String, _ text: String) -> [[String]] {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        return regex.matches(in: text, range: NSRange(text.startIndex..., in: text)).map { match in
            (0..<match.numberOfRanges).map { i in Range(match.range(at: i), in: text).map { String(text[$0]) } ?? "" }
        }
    }
    private static func validDate(_ value: String) -> Bool {
        guard value.count == 10 else { return false }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        guard let date = formatter.date(from: value) else { return false }
        return formatter.string(from: date) == value
    }
    private static func noticeDates(_ text: String, year: Int) throws -> [(date: String, lunar: String)] {
        var month = 1
        return try captures(#"(?:(\d{4})年)?(?:(\d{1,2})月)?(\d{1,2})日(?:[（(]([^）)]*)[）)])?"#, text).map { match in
            if let value = Int(match[2]) { month = value }
            let date = String(format: "%04d-%02d-%02d", Int(match[1]) ?? year, month, Int(match[3]) ?? 0)
            guard validDate(date) else { throw CalendarRefreshError.invalidData }
            return (date, match[4])
        }
    }
    public static func parse(html: String, year: Int, source: String, math: DateEngine) throws -> DateEngine {
        guard official(source) else { throw CalendarRefreshError.invalidData }
        var text = html.replacingOccurrences(of: #"(?is)<script\b[^>]*>.*?</script>|<style\b[^>]*>.*?</style>"#, with: "", options: .regularExpression)
        text = text.replacingOccurrences(of: #"<[^>]+>|&nbsp;|&#160;|\s+"#, with: "", options: .regularExpression)
        for (old, new) in ["國":"国", "慶":"庆", "節":"节", "勞":"劳", "動":"动", "農":"农", "曆":"历", "週":"周", "辦":"办", "廳":"厅", "號":"号", "電":"电", "發":"发"] { text = text.replacingOccurrences(of: old, with: new) }
        guard text.contains("\(year)年部分节假日安排的通知") else { throw CalendarRefreshError.invalidData }
        let sections = captures(#"[一二三四五六七八九十]+、([^：:]{2,20})[：:]([\s\S]*?)(?=[一二三四五六七八九十]+、[^：:]{2,20}[：:]|$)"#, text)
        var holidays: [Holiday] = []
        var workdays: [String] = []
        var springs: [SpringDate] = []
        var found = Set<String>()
        for section in sections {
            let name = section[1]
            guard names.contains(where: { name.contains($0) }) else { continue }
            names.filter { name.contains($0) }.forEach { found.insert($0) }
            let sentences = section[2].components(separatedBy: "。")
            let off = try noticeDates(sentences.first(where: { $0.contains("放假") }) ?? "", year: year)
            guard let first = off.first, let last = off.last else { throw CalendarRefreshError.invalidData }
            holidays.append(Holiday(name: name, start: first.date, end: last.date))
            for sentence in sentences where sentence.contains("上班") && !sentence.contains("放假") { let work = try noticeDates(sentence, year: year); workdays += work.map { $0.date } }
            if name.contains("春节") {
                let numerals = ["初一":1, "初二":2, "初三":3, "初四":4, "初五":5, "初六":6, "初七":7, "初八":8, "初九":9, "初十":10]
                for item in off {
                    let lunar = captures(#"正月(初[一二三四五六七八九十])"#, item.lunar).first
                    if let lunar, let day = numerals[lunar[1]] { springs.append(SpringDate(date: math.addDays(item.date, 1 - day), source: source)); break }
                    if item.lunar.contains("除夕") { springs.append(SpringDate(date: math.addDays(item.date, 1), source: source)); break }
                }
            }
        }
        guard found.count == 7 else { throw CalendarRefreshError.invalidData }
        let document = captures(#"国办发明电〔\d{4}〕\d+号"#, text).first?.first ?? "\(year)年国务院办公厅放假通知"
        let data = CalendarData(schemaVersion: 1, region: "CN", updatedAt: DateEngine.localToday(), sources: [CalendarSource(year: year, url: source, document: document)], holidays: holidays, workdays: Array(Set(workdays)).sorted())
        let result = DateEngine(data: data, springs: SpringData(source: "中国科学院紫金山天文台、国务院公告及大陆政务公开资料", dates: springs))
        guard valid(result) else { throw CalendarRefreshError.invalidData }
        return result
    }
    public static func valid(_ engine: DateEngine) -> Bool {
        let data = engine.data
        guard data.schemaVersion == 1, data.region == "CN", !data.sources.isEmpty, data.sources.count <= 100, data.holidays.count <= 1000, data.workdays.count <= 1000, validDate(data.updatedAt) else { return false }
        var used = Set<String>()
        for holiday in data.holidays {
            guard validDate(holiday.start), validDate(holiday.end), holiday.start <= holiday.end, engine.days(holiday.start, holiday.end) <= 20 else { return false }
            var day = holiday.start
            while day <= holiday.end {
                guard used.insert(day).inserted else { return false }
                day = engine.addDays(day, 1)
            }
        }
        guard data.workdays.allSatisfy({ validDate($0) && !used.contains($0) }), Set(data.workdays).count == data.workdays.count else { return false }
        let dates = engine.springs.dates
        guard dates.count <= 100, Set(dates.map { String($0.date.prefix(4)) }).count == dates.count else { return false }
        return dates.enumerated().allSatisfy { i, item in
            validDate(item.date) && (item.date.dropFirst(5).prefix(2) == "01" || item.date.dropFirst(5).prefix(2) == "02") && item.source.hasPrefix("https://") && (i == 0 || dates[i - 1].date < item.date)
        }
    }
    public static func merge(base: DateEngine, update: DateEngine) throws -> DateEngine {
        let years = Set(update.data.sources.map { $0.year })
        let sources = (base.data.sources.filter { !years.contains($0.year) } + update.data.sources).sorted { $0.year < $1.year }
        let holidays = (base.data.holidays.filter { !years.contains(Int($0.start.prefix(4)) ?? 0) } + update.data.holidays).sorted { $0.start < $1.start }
        let workdays = Array(Set(base.data.workdays.filter { !years.contains(Int($0.prefix(4)) ?? 0) } + update.data.workdays)).sorted()
        var dates = Dictionary(uniqueKeysWithValues: base.springs.dates.map { (String($0.date.prefix(4)), $0) })
        for item in update.springs.dates { dates[String(item.date.prefix(4))] = item }
        let data = CalendarData(schemaVersion: 1, region: "CN", updatedAt: update.data.updatedAt, sources: sources, holidays: holidays, workdays: workdays)
        let result = DateEngine(data: data, springs: SpringData(source: update.springs.source, dates: dates.values.sorted { $0.date < $1.date }))
        guard valid(result) else { throw CalendarRefreshError.invalidData }
        return result
    }
}
