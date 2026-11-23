import AppKit
import Combine
import DaywishCore
import ServiceManagement

@MainActor
final class AppModel: ObservableObject {
    let softwareUpdates = SoftwareUpdater()
    @Published var preferences: Preferences { didSet { refresh(); onPreferencesChanged?(); scheduleSave() } }
    @Published var today = DateEngine.localToday()
    @Published var payday: Countdown?
    @Published var holiday: HolidayCountdown?
    @Published var spring: Countdown?
    @Published var panel: String? { didSet { onPreferencesChanged?() } }
    @Published var error = ""
    var engine: DateEngine
    @Published var calendarMessage = "使用本地日历，可自动检查更新"
    @Published var checkingCalendar = false
    private var calendarCache: CalendarCache
    private var updateTask: Task<Void, Never>?
    var onPreferencesChanged: (() -> Void)?
    var hideWindow: (() -> Void)?
    private var saveWork: DispatchWorkItem?
    private var observations: [NSObjectProtocol] = []
    private var wakeObservation: NSObjectProtocol?
    private var midnight: Timer?
    private let settingsURL: URL
    private let calendarURL: URL

    init() throws {
        let bundled = try DateEngine()
        engine = bundled
        calendarCache = CalendarCache(engine: bundled)
        let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        settingsURL = support.appendingPathComponent("Daywish/settings.json")
        calendarURL = support.appendingPathComponent("Daywish/calendar.json")
        var loadError = ""
        if FileManager.default.fileExists(atPath: settingsURL.path) {
            do { preferences = try JSONDecoder().decode(Preferences.self, from: Data(contentsOf: settingsURL)).validated() }
            catch { preferences = Preferences(); loadError = "原设置文件无法读取，已恢复默认值。" }
        } else { preferences = Preferences() }
        preferences.launchAtLogin = SMAppService.mainApp.status == .enabled
        if let bytes = try? Data(contentsOf: calendarURL) {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            if let cache = try? decoder.decode(CalendarCache.self, from: bytes), CalendarRefresh.valid(cache.engine), let merged = try? CalendarRefresh.merge(base: engine, update: cache.engine) {
                calendarCache = cache
                engine = merged
                calendarMessage = cache.message
            }
        }
        error = loadError
        refresh()
        let center = NotificationCenter.default
        for name in [Notification.Name.NSCalendarDayChanged, NSApplication.didBecomeActiveNotification, Notification.Name.NSSystemTimeZoneDidChange, Notification.Name.NSSystemClockDidChange] {
            observations.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor in self?.refresh() }
            })
        }
        wakeObservation = NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
    }
    func refresh() {
        today = DateEngine.localToday(mode: preferences.timeZone)
        payday = try? engine.nextPayday(today: today, preferences: preferences)
        holiday = engine.nextHoliday(today: today)
        spring = engine.nextSpring(today: today)
        midnight?.invalidate()
        var local = Calendar(identifier: .gregorian)
        local.timeZone = DateEngine.selectedZone(preferences.timeZone)
        if let tomorrow = local.date(byAdding: .day, value: 1, to: local.startOfDay(for: Date())) {
            let timer = Timer(fire: tomorrow.addingTimeInterval(1), interval: 0, repeats: false) { [weak self] _ in
                Task { @MainActor in self?.refresh() }
            }
            timer.tolerance = 2
            midnight = timer
            RunLoop.main.add(timer, forMode: .common)
        }
        if preferences.autoUpdate { checkUpdates() }
    }
    func checkUpdates(force: Bool = false) {
        guard !checkingCalendar, force || CalendarRefresh.shouldCheck(cache: calendarCache) else { return }
        checkingCalendar = true
        let date = DateEngine.localToday()
        let year = (Int(date.prefix(4)) ?? 2026) + ((Int(date.dropFirst(5).prefix(2)) ?? 0) >= 9 ? 1 : 0)
        updateTask = Task { [weak self] in
            guard let self else { return }
            defer { self.checkingCalendar = false }
            do {
                let result = try await CalendarRefresh.refresh(year: year, base: self.engine)
                if Task.isCancelled { return }
                var cache = CalendarCache(engine: result)
                cache.lastChecked = Date(); cache.lastSuccess = Date(); cache.message = "已核对 \(year) 年国务院放假通知"
                try self.saveCalendar(cache)
                self.calendarCache = cache; self.engine = result; self.calendarMessage = cache.message
                self.refresh()
            } catch {
                if Task.isCancelled { return }
                self.calendarCache.lastChecked = Date()
                if let refreshError = error as? CalendarRefreshError, case .unpublished = refreshError {
                    self.calendarCache.failed = false
                    self.calendarCache.message = "\(year) 年官方安排尚未收录，保留现有日历"
                } else {
                    self.calendarCache.failed = true
                    self.calendarCache.message = "检查未完成，继续使用本地日历；可稍后重试"
                }
                self.calendarMessage = self.calendarCache.message
                try? self.saveCalendar(self.calendarCache)
            }
        }
    }
    private func saveCalendar(_ cache: CalendarCache) throws {
        try FileManager.default.createDirectory(at: calendarURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        try encoder.encode(cache).write(to: calendarURL, options: .atomic)
    }
    private func scheduleSave() {
        saveWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.flush() }
        saveWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2, execute: work)
    }
    func flush() {
        saveWork?.cancel()
        do {
            try FileManager.default.createDirectory(at: settingsURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONEncoder().encode(preferences).write(to: settingsURL, options: .atomic)
        } catch { self.error = "设置未保存，请检查磁盘空间与目录权限。" }
    }
    func setLaunchAtLogin(_ enabled: Bool) {
        do {
            if enabled { try SMAppService.mainApp.register() }
            else { try SMAppService.mainApp.unregister() }
            preferences.launchAtLogin = SMAppService.mainApp.status == .enabled
            if enabled && !preferences.launchAtLogin { error = "请在系统设置的“登录项”中允许好日将至。" }
        } catch { self.error = "无法设置开机启动。请将应用放入“应用程序”，再检查系统设置中的登录项。" }
    }
    func shutdown() {
        updateTask?.cancel()
        flush()
        midnight?.invalidate()
        observations.forEach { NotificationCenter.default.removeObserver($0) }
        if let wakeObservation { NSWorkspace.shared.notificationCenter.removeObserver(wakeObservation) }
    }
    var dateLabel: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.timeZone = DateEngine.selectedZone(preferences.timeZone)
        formatter.dateFormat = "M/d"
        return formatter.string(from: Date())
    }
}
