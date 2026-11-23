import XCTest
@testable import DaywishCore

final class DateEngineTests: XCTestCase {
    struct Cases: Decodable {
        struct Pay: Decodable { let today: String; let payday: Int; let rule: PaydayRule; let expected: String }
        struct Spring: Decodable { let today: String; let expected: String }
        let paydays: [Pay]
        let springs: [Spring]
    }
    func testSharedPaydayAndSpringCases() throws {
        let engine = try DateEngine()
        let cases = try SharedResources.decode("date-cases", as: Cases.self)
        for item in cases.paydays {
            var preferences = Preferences()
            preferences.payday = item.payday
            preferences.paydayRule = item.rule
            let result = try engine.nextPayday(today: item.today, preferences: preferences)
            XCTAssertEqual(result.date, item.expected, "\(item.today), \(item.rule)")
            XCTAssertEqual(result.days, engine.days(item.today, item.expected))
        }
        for item in cases.springs { XCTAssertEqual(engine.nextSpring(today: item.today)?.date, item.expected, item.today) }
    }
    func testHolidaysAndMakeupDays() throws {
        let engine = try DateEngine()
        XCTAssertEqual(engine.nextHoliday(today: "2026-11-28")?.holiday.start, "2027-01-01")
        XCTAssertEqual(engine.nextHoliday(today: "2026-10-07")?.ongoing, true)
        XCTAssertNil(engine.nextHoliday(today: "2028-01-01"))
        XCTAssertTrue(engine.isWorkingDay("2026-02-14"))
        XCTAssertFalse(engine.isWorkingDay("2026-02-16"))
        XCTAssertEqual(engine.addDays("2028-02-28", 1), "2028-02-29")
    }
}
