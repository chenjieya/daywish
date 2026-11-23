import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dateKey, nextMidnight, paydayProgress, holidayProgress, springProgress, cycleProgress } from '../src/lib/dates.ts'
import { defaultSettings, normalizeSettings } from '../src/types/settings.ts'
import { parseOfficialNotice, mergeCalendar, shouldCheckCalendar, validateCalendar, validateSprings, fetchOfficialCalendar } from '../src/lib/calendar-update.ts'
import type { CalendarData, SpringData, UpdateStatus } from '../src/types/calendar.ts'

const calendar = JSON.parse(readFileSync(new URL('../shared/calendar.json', import.meta.url), 'utf8')) as CalendarData
const springs = JSON.parse(readFileSync(new URL('../shared/springs.json', import.meta.url), 'utf8')) as SpringData
// 国务院办公厅年度通知原文的日期段，保留用于校验解析器；来源写在对应 URL 中。
const notice2027 = `国务院办公厅关于2027年部分节假日安排的通知 国办发明电〔2026〕10号
一、元旦：1月1日（周五）至3日（周日）放假，共3天。
二、春节：2月5日（农历除夕、周五）至13日（农历正月初八、周六）放假调休，共9天。1月31日（周日）、2月14日（周日）上班。
三、清明节：4月3日（周六）至5日（周一）放假，共3天。
四、劳动节：5月1日（周六）至5日（周三）放假调休，共5天。5月8日（周六）上班。
五、端午节：6月9日（周三）放假，共1天。
六、中秋节：9月15日（周三）放假，共1天。
七、国庆节：10月1日（周五）至7日（周四）放假调休，共7天。9月26日（周日）、10月9日（周六）上班。`
const url = 'https://www.gov.cn/zhengce/zhengceku/202611/content_7085102.htm'
const parsed = () => parseOfficialNotice(notice2027, 2027, url)

test('北京时间在 UTC 16 点跨天，系统时区可独立选择', () => {
  const instant = new Date('2026-11-23T16:30:00Z')
  assert.equal(dateKey(instant), '2026-11-24')
  const previousZone = process.env.TZ
  try {
    process.env.TZ = 'America/Los_Angeles'
    assert.equal(dateKey(instant, 'system'), '2026-11-23')
    assert.equal(dateKey(instant, 'beijing'), '2026-11-24')
    assert.equal(nextMidnight(instant, 'beijing'), Date.parse('2026-11-24T16:00:01Z'))
  } finally { if (previousZone === undefined) delete process.env.TZ; else process.env.TZ = previousZone }
})
test('时间与旧主题设置迁移', () => {
  assert.equal(normalizeSettings({ theme: 'forest' }).theme, 'white')
  assert.equal(normalizeSettings({}).timeZone, 'beijing')
  assert.equal(normalizeSettings({ timeZone: 'system', autoUpdate: false }).timeZone, 'system')
  assert.equal(normalizeSettings({ autoUpdate: false }).autoUpdate, false)
})
test('进度按真实工资周期与假期周期计算，不凭空填百分比', () => {
  assert.ok(Math.abs(paydayProgress('2026-11-23', defaultSettings, calendar)! - 13 / 30 * 100) < .001)
  assert.equal(paydayProgress('2026-11-10', defaultSettings, calendar), 100)
  assert.equal(holidayProgress('2026-10-07', calendar), 100)
  assert.ok((springProgress('2026-11-23', springs) ?? 0) > 75)
  assert.equal(cycleProgress(undefined, '2027-01-01', '2026-11-23'), null)
})
test('春节改为大陆权威来源', () => {
  assert.ok(springs.source.includes('紫金山'))
  assert.ok(springs.dates.every(d => !d.source.includes('hko.gov.hk')))
})
test('完整解析大陆官方通知中的七个假期、补班与正月初一', () => {
  const result = parsed()
  assert.deepEqual(result.calendar.holidays, calendar.holidays.filter(h => h.start.startsWith('2027')))
  assert.deepEqual(result.calendar.workdays, calendar.workdays.filter(d => d.startsWith('2027')))
  assert.equal(result.springs.dates[0]?.date, '2027-02-06')
  assert.equal(result.springs.dates[0]?.source, url)
})
test('春节首日不是除夕时，通过正月初七反推正月初一', () => {
  const text = notice2027.replaceAll('2027', '2026').replace('2月5日（农历除夕、周五）至13日（农历正月初八、周六）', '2月15日（农历腊月二十八、周日）至23日（农历正月初七、周一）').replace('1月31日（周日）、2月14日（周日）上班', '2月14日（周六）、2月28日（周六）上班')
  const result = parseOfficialNotice(text, 2026, 'https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm')
  assert.equal(result.springs.dates[0]?.date, '2026-02-17')
})
test('年份、完整性或日期不正确时拒绝覆盖本地数据', () => {
  assert.throws(() => parseOfficialNotice(notice2027, 2028, url))
  assert.throws(() => parseOfficialNotice(notice2027.replace('2月5日', '2月30日'), 2027, url))
  assert.throws(() => parseOfficialNotice(notice2027.split('七、')[0]!, 2027, url))
  assert.throws(() => parseOfficialNotice(notice2027, 2027, 'https://example.com/fake'))
  assert.equal(validateCalendar({ ...calendar, workdays: [...calendar.workdays, '2027-02-06'] }), false)
  assert.equal(validateSprings({ source: 'invalid', dates: [{ date: '2027-04-01', source: url }] }), false)
})
test('更新单个年份保留其他年份和未来已知春节', () => {
  const result = mergeCalendar({ calendar, springs }, parsed())
  assert.equal(result.calendar.holidays.length, 14)
  assert.equal(result.springs.dates.length, springs.dates.length)
  assert.equal(result.calendar.sources.find(s => s.year === 2027)?.url, url)
  assert.equal(result.springs.dates.find(s => s.date.startsWith('2028'))?.date, '2028-01-26')
})
test('按年检查；次年未公布每周重试；网络失败每天重试', () => {
  const status: UpdateStatus = { lastChecked: '2026-11-01T00:00:00Z', lastSuccess: '2026-11-01T00:00:00Z', failed: false, message: '' }
  assert.equal(shouldCheckCalendar(new Date('2026-11-23T00:00:00Z'), status, calendar), false)
  const only2026 = { ...calendar, sources: calendar.sources.filter(s => s.year === 2026) }
  assert.equal(shouldCheckCalendar(new Date('2026-11-07T00:00:00Z'), status, only2026), false)
  assert.equal(shouldCheckCalendar(new Date('2026-11-08T00:00:00Z'), status, only2026), true)
  assert.equal(shouldCheckCalendar(new Date('2027-01-01T00:00:00Z'), status, calendar), true)
  assert.equal(shouldCheckCalendar(new Date('2026-11-01T12:00:00Z'), { ...status, failed: true }, calendar), false)
  assert.equal(shouldCheckCalendar(new Date('2026-11-02T00:00:00Z'), { ...status, failed: true }, calendar), true)
})
test('索引只定位公告，实际日期取官方原文；失败可切换索引镜像', async () => {
  const calls: string[] = []
  const result = await fetchOfficialCalendar(2027, async address => {
    calls.push(address)
    if (address.startsWith('https://cdn.jsdelivr.net')) throw new Error('offline')
    if (address.startsWith('https://raw.githubusercontent.com')) return JSON.stringify({ year: 2027, papers: [url], days: [{ date: '2027-02-07' }] })
    return notice2027
  })
  assert.equal(result.springs.dates[0]?.date, '2027-02-06')
  assert.equal(calls.length, 3)
})
