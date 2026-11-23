import XCTest
@testable import DaywishCore

final class CalendarRefreshTests: XCTestCase {
    private let source = "https://www.gov.cn/zhengce/zhengceku/202611/content_7085102.htm"
    private let notice = """
    国务院办公厅关于2027年部分节假日安排的通知 国办发明电〔2026〕10号
    一、元旦：1月1日（周五）至3日（周日）放假，共3天。
    二、春节：2月5日（农历除夕、周五）至13日（农历正月初八、周六）放假调休，共9天。1月31日（周日）、2月14日（周日）上班。
    三、清明节：4月3日（周六）至5日（周一）放假，共3天。
    四、劳动节：5月1日（周六）至5日（周三）放假调休，共5天。5月8日（周六）上班。
    五、端午节：6月9日（周三）放假，共1天。
    六、中秋节：9月15日（周三）放假，共1天。
    七、国庆节：10月1日（周五）至7日（周四）放假调休，共7天。9月26日（周日）、10月9日（周六）上班。
    """
    func testOfficialParserAndMerge() throws {
        let base = try DateEngine()
        let updated = try CalendarRefresh.parse(html: notice, year: 2027, source: source, math: base)
        XCTAssertEqual(updated.data.holidays.count, 7)
        XCTAssertEqual(updated.data.workdays.count, 5)
        XCTAssertEqual(updated.nextSpring(today: "2026-11-23")?.date, "2027-02-06")
        let merged = try CalendarRefresh.merge(base: base, update: updated)
        XCTAssertEqual(merged.data.holidays.count, 14)
        XCTAssertEqual(merged.nextSpring(today: "2027-02-07")?.date, "2028-01-26")
        XCTAssertThrowsError(try CalendarRefresh.parse(html: notice, year: 2028, source: source, math: base))
        XCTAssertThrowsError(try CalendarRefresh.parse(html: notice, year: 2027, source: "https://example.com", math: base))
    }
    func testBeijingZoneAndProgress() throws {
        let base = try DateEngine()
        let date = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-11-23T16:30:00Z"))
        XCTAssertEqual(DateEngine.localToday(date), "2026-11-24")
        let value = try XCTUnwrap(base.paydayProgress(today: "2026-11-23", preferences: Preferences()))
        XCTAssertEqual(value, 13.0 / 30 * 100, accuracy: 0.001)
        XCTAssertEqual(base.paydayProgress(today: "2026-11-10", preferences: Preferences()), 100)
    }
    func testLegacyPreferencesKeepDefaultsForNewFields() throws {
        let json = Data(#"{"payday":15,"opacity":60,"theme":"dawn"}"#.utf8)
        let preferences = try JSONDecoder().decode(Preferences.self, from: json)
        XCTAssertEqual(preferences.payday, 15)
        XCTAssertEqual(preferences.timeZone, .beijing)
        XCTAssertTrue(preferences.autoUpdate)
    }
}
