import type { CalendarData, Countdown, HolidayCountdown, SpringData } from '../types/calendar.ts'
import type { Settings, TimeZoneMode } from '../types/settings.ts'
import springs from '../../shared/springs.json' with { type: 'json' }

const DAY = 86_400_000
/** 用本地日历提取日期，再用 UTC 序号计算日差，避免夏令时的 23/25 小时问题。 */
export function dateKey(date: Date, mode: TimeZoneMode = 'beijing'): string {
  const zone = mode === 'beijing' ? 'Asia/Shanghai' : Intl.DateTimeFormat().resolvedOptions().timeZone
  const parts = new Intl.DateTimeFormat('en', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-')
}
/** 北京时间跨天不受设备本地时区和夏令时影响；只设一个跨天定时器。 */
export function nextMidnight(now: Date, mode: TimeZoneMode): number {
  if (mode === 'beijing') return Date.parse(`${addDays(dateKey(now, mode), 1)}T00:00:01+08:00`)
  const target = new Date(now)
  target.setHours(24, 0, 1, 0)
  return target.getTime()
}
export function ordinal(key: string): number {
  const [y = 0, m = 0, d = 0] = key.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / DAY
}
export function addDays(key: string, days: number): string {
  return new Date((ordinal(key) + days) * DAY).toISOString().slice(0, 10)
}
export function daysBetween(from: string, to: string): number { return ordinal(to) - ordinal(from) }
export function formatDate(key: string): string {
  const [, month, day] = key.split('-')
  return `${Number(month)}月${Number(day)}日`
}
export function isWorkingDay(key: string, data: CalendarData): boolean {
  if (data.workdays.includes(key)) return true
  if (data.holidays.some(h => h.start <= key && key <= h.end)) return false
  const weekday = new Date(ordinal(key) * DAY).getUTCDay()
  return weekday !== 0 && weekday !== 6
}
function paydayCandidates(today: string, settings: Settings, data: CalendarData): Countdown[] {
  const start = new Date(ordinal(today) * DAY)
  const candidates: Countdown[] = []
  // 上月顺延和下月提前都可能落入本月；枚举相邻月份后排序，避免跨月漏算。
  for (let offset = -2; offset <= 2; offset++) {
    const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset + 1, 0))
    const day = settings.payday === 0 ? last.getUTCDate() : Math.min(settings.payday, last.getUTCDate())
    const nominal = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), day)).toISOString().slice(0, 10)
    let actual = nominal
    let estimated = false
    if (settings.paydayRule !== 'exact') {
      const direction = settings.paydayRule === 'previous' ? -1 : 1
      for (let i = 0; i < 31; i++) {
        // 未公布年份不猜测调休：保留约定工资日并明确提示。
        if (!data.sources.some(s => s.year === Number(actual.slice(0, 4)))) { estimated = true; actual = nominal; break }
        if (isWorkingDay(actual, data)) break
        actual = addDays(actual, direction)
      }
    }
    candidates.push({ date: actual, days: daysBetween(today, actual), note: estimated ? '该年调休待更新，暂按约定日' : actual !== nominal ? `由${formatDate(nominal)}${settings.paydayRule === 'previous' ? '提前' : '顺延'}` : settings.payday === 0 ? '每月最后一天' : `每月 ${settings.payday} 日` })
  }
  return candidates.sort((a, b) => a.date.localeCompare(b.date))
}
export function nextPayday(today: string, settings: Settings, data: CalendarData): Countdown {
  const next = paydayCandidates(today, settings, data).find(candidate => candidate.date >= today)
  if (!next) throw new Error('无法计算工资日')
  return next
}
export function cycleProgress(start: string | undefined, end: string, today: string): number | null {
  if (today >= end) return 100
  if (!start || start >= end) return null
  return Math.max(0, Math.min(100, daysBetween(start, today) / daysBetween(start, end) * 100))
}
export function paydayProgress(today: string, settings: Settings, data: CalendarData): number | null {
  const candidates = paydayCandidates(today, settings, data)
  const next = candidates.find(candidate => candidate.date >= today)
  const previous = candidates.filter(candidate => candidate.date < today).at(-1)
  return next ? cycleProgress(previous?.date, next.date, today) : null
}
export function holidayProgress(today: string, data: CalendarData): number | null {
  const next = nextHoliday(today, data)
  if (!next) return null
  if (next.ongoing) return 100
  const previous = [...data.holidays].filter(h => h.end < today).sort((a, b) => a.end.localeCompare(b.end)).at(-1)
  return cycleProgress(previous ? addDays(previous.end, 1) : undefined, next.date, today)
}
export function springProgress(today: string, data: SpringData = springs): number | null {
  const next = data.dates.find(item => item.date >= today)
  const previous = data.dates.filter(item => item.date < today).at(-1)
  return next ? cycleProgress(previous?.date, next.date, today) : null
}
export function nextHoliday(today: string, data: CalendarData): HolidayCountdown | null {
  const holiday = [...data.holidays].sort((a, b) => a.start.localeCompare(b.start)).find(h => h.end >= today)
  if (!holiday) return null
  return { ...holiday, date: holiday.start, days: Math.max(0, daysBetween(today, holiday.start)), length: daysBetween(holiday.start, holiday.end) + 1, ongoing: holiday.start <= today, note: `${formatDate(holiday.start)} — ${formatDate(holiday.end)}` }
}

/** 采用大陆官方日历与公告，避免系统 ICU 农历算法产生一日误差。 */
export function nextSpring(today: string, data: SpringData = springs): Countdown {
  const date = data.dates.find(item => item.date >= today)?.date
  if (!date) throw new Error('春节历表待更新')
  return { date, days: daysBetween(today, date), note: `${date.slice(0, 4)} 年 · 正月初一` }
}
