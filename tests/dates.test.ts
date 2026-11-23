import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { addDays, daysBetween, nextHoliday, nextPayday, nextSpring, isWorkingDay } from '../src/lib/dates.ts'
import { defaultSettings, normalizeSettings } from '../src/types/settings.ts'
import type { CalendarData } from '../src/types/calendar.ts'
import type { PaydayRule } from '../src/types/settings.ts'

const calendar = JSON.parse(readFileSync(new URL('../shared/calendar.json', import.meta.url), 'utf8')) as CalendarData
const cases = JSON.parse(readFileSync(new URL('../shared/date-cases.json', import.meta.url), 'utf8')) as {
  paydays: { today: string; payday: number; rule: PaydayRule; expected: string }[]
  springs: { today: string; expected: string }[]
}
for (const c of cases.paydays) test(`工资：${c.today} / ${c.payday} / ${c.rule}`, () => {
  const actual = nextPayday(c.today, { ...defaultSettings, payday: c.payday, paydayRule: c.rule }, calendar)
  assert.equal(actual.date, c.expected)
  assert.equal(actual.days, daysBetween(c.today, c.expected))
})
for (const c of cases.springs) test(`正月初一：${c.today}`, () => assert.equal(nextSpring(c.today).date, c.expected))
test('普通周末不作为节假日；跨年寻找元旦', () => {
  assert.equal(nextHoliday('2026-11-23', calendar)?.date, '2027-01-01')
  assert.equal(nextHoliday('2026-11-28', calendar)?.date, '2027-01-01')
})
test('假期进行中显示正在放假；结束次日寻找下一假期', () => {
  assert.equal(nextHoliday('2026-10-07', calendar)?.ongoing, true)
  assert.equal(nextHoliday('2026-10-07', calendar)?.days, 0)
  assert.equal(nextHoliday('2026-10-08', calendar)?.date, '2027-01-01')
})
test('春节假期首日与正月初一分别计算', () => {
  assert.equal(nextHoliday('2027-02-04', calendar)?.date, '2027-02-05')
  assert.equal(nextSpring('2027-02-04').date, '2027-02-06')
})
test('未公布假期不推测；补班工作日优先于周末', () => {
  assert.equal(nextHoliday('2028-01-01', calendar), null)
  assert.equal(isWorkingDay('2026-02-14', calendar), true)
  assert.equal(isWorkingDay('2026-02-16', calendar), false)
})
test('日差不受夏令时、闰日和跨年影响', () => {
  assert.equal(daysBetween('2026-03-08', '2026-03-09'), 1)
  assert.equal(addDays('2028-02-28', 1), '2028-02-29')
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1)
})
test('持久化数据与 IPC 输入校验', () => {
  assert.deepEqual(normalizeSettings(null), defaultSettings)
  const actual = normalizeSettings({ payday: 32, opacity: Infinity, theme: 'unknown', compact: 'true' })
  assert.deepEqual(actual, defaultSettings)
  assert.equal(normalizeSettings({ opacity: -1 }).opacity, 0)
})

test('旧版全透明设置升级为可读的 Windows 磨砂，保留工资日和 Mac 衬底', () => {
  const old = normalizeSettings({ payday: 25, opacity: 0, timeZone: 'system' })
  assert.equal(old.frostOpacity, 84)
  assert.equal(old.payday, 25)
  assert.equal(old.timeZone, 'system')
  assert.equal(old.opacity, 0)
  assert.equal(normalizeSettings({ frostOpacity: 0 }).frostOpacity, 70)
  assert.equal(normalizeSettings({ frostOpacity: 100 }).frostOpacity, 96)
  assert.equal(normalizeSettings({ frostOpacity: 91, opacity: 15 }).frostOpacity, 91)
  assert.equal(normalizeSettings({ frostOpacity: NaN }).frostOpacity, 84)
})
test('官方日历数据完整且没有冲突', () => {
  assert.equal(calendar.schemaVersion, 1)
  assert.equal(calendar.holidays.length, 14)
  const used = new Set<string>()
  for (const h of calendar.holidays) {
    assert.ok(h.start <= h.end)
    for (let day = h.start; day <= h.end; day = addDays(day, 1)) {
      assert.ok(!used.has(day), `假期重叠：${day}`)
      assert.ok(!calendar.workdays.includes(day), `补班与假期冲突：${day}`)
      used.add(day)
    }
  }
})
