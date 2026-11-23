import type { CalendarBundle, CalendarData, CalendarUpdate, Holiday, SpringData, UpdateStatus } from '../types/calendar.ts'
import { addDays, dateKey, daysBetween } from './dates.ts'

const DAY = 86_400_000
const holidayNames = ['元旦', '春节', '清明节', '劳动节', '端午节', '中秋节', '国庆节']
export type TextLoader = (url: string) => Promise<string>

function civilDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
}
function officialURL(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try { const url = new URL(value); return url.protocol === 'https:' && (url.hostname === 'www.gov.cn' || url.hostname === 'big5.www.gov.cn') } catch { return false }
}
/** 缓存与网络输入共用校验；错误数据不替换仍然可用的本地数据。 */
export function validateCalendar(value: unknown): value is CalendarData {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.schemaVersion !== 1 || v.region !== 'CN' || !civilDate(v.updatedAt) || !Array.isArray(v.sources) || !Array.isArray(v.holidays) || !Array.isArray(v.workdays)) return false
  if (v.sources.length < 1 || v.sources.length > 100 || v.holidays.length > 1000 || v.workdays.length > 1000) return false
  if (!v.sources.every(s => s && typeof s === 'object' && Number.isInteger(s.year) && s.year >= 2000 && s.year <= 2100 && typeof s.url === 'string' && s.url.startsWith('https://') && typeof s.document === 'string')) return false
  const used = new Set<string>()
  for (const item of v.holidays) {
    if (!item || typeof item !== 'object' || typeof item.name !== 'string' || item.name.length > 20 || !civilDate(item.start) || !civilDate(item.end) || item.start > item.end || daysBetween(item.start, item.end) > 20) return false
    for (let day = item.start; day <= item.end; day = addDays(day, 1)) { if (used.has(day)) return false; used.add(day) }
  }
  return v.workdays.every(day => civilDate(day) && !used.has(day)) && new Set(v.workdays).size === v.workdays.length
}
export function validateSprings(value: unknown): value is SpringData {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.source !== 'string' || !Array.isArray(v.dates) || v.dates.length > 100) return false
  const years = v.dates.map(item => item && typeof item.date === 'string' ? item.date.slice(0, 4) : '')
  if (new Set(years).size !== years.length) return false
  return v.dates.every((item, i, dates) => item && civilDate(item.date) && /-(01|02)-/.test(item.date) && typeof item.source === 'string' && item.source.startsWith('https://') && (i === 0 || dates[i - 1].date < item.date))
}

interface ParsedDate { date: string; lunar: string }
function noticeDates(text: string, year: number): ParsedDate[] {
  let month = 1
  const result: ParsedDate[] = []
  for (const match of text.matchAll(/(?:(\d{4})年)?(?:(\d{1,2})月)?(\d{1,2})日(?:[（(]([^）)]*)[）)])?/g)) {
    if (match[2]) month = Number(match[2])
    const value = `${match[1] ?? year}-${String(month).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`
    if (!civilDate(value)) throw new Error('官方通知日期格式已变化，保留本地日历')
    result.push({ date: value, lunar: match[4] ?? '' })
  }
  return result
}
/** 只解析官方年度完整通知；不能识别或出现日期冲突时整体拒绝，避免半份年度数据生效。 */
export function parseOfficialNotice(html: string, year: number, url: string): CalendarBundle {
  if (!officialURL(url)) throw new Error('不是中国政府网通知地址')
  const traditional: Record<string, string> = { 國: '国', 慶: '庆', 節: '节', 勞: '劳', 動: '动', 農: '农', 曆: '历', 週: '周', 關: '关', 於: '于', 辦: '办', 廳: '厅', 號: '号', 電: '电', 發: '发' }
  const text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '').replace(/&nbsp;|&#160;/g, '').replace(/\s+/g, '').replace(/[國慶節勞動農曆週關於辦廳號電發]/g, c => traditional[c] ?? c)
  if (!text.includes(`${year}年部分节假日安排的通知`)) throw new Error('通知年份不匹配')
  const holidays: Holiday[] = []
  const workdays: string[] = []
  const dates: SpringData['dates'] = []
  const names = new Set<string>()
  for (const section of text.matchAll(/[一二三四五六七八九十]+、([^：:]{2,20})[：:]([\s\S]*?)(?=[一二三四五六七八九十]+、[^：:]{2,20}[：:]|$)/g)) {
    const name = section[1] ?? ''
    if (!holidayNames.some(n => name.includes(n))) continue
    for (const n of holidayNames) if (name.includes(n)) names.add(n)
    const sentences = (section[2] ?? '').split('。')
    const off = noticeDates(sentences.find(sentence => sentence.includes('放假')) ?? '', year)
    if (!off[0]) throw new Error('通知缺少完整放假日期')
    const last = off.at(-1) ?? off[0]
    holidays.push({ name, start: off[0].date, end: last.date })
    for (const sentence of sentences.filter(s => s.includes('上班') && !s.includes('放假'))) workdays.push(...noticeDates(sentence, year).map(d => d.date))
    if (name.includes('春节')) {
      const numerals: Record<string, number> = { 初一: 1, 初二: 2, 初三: 3, 初四: 4, 初五: 5, 初六: 6, 初七: 7, 初八: 8, 初九: 9, 初十: 10 }
      for (const item of off) {
        const lunar = item.lunar.match(/正月(初[一二三四五六七八九十])/)
        const day = lunar?.[1] ? numerals[lunar[1]] : undefined
        if (day) { dates.push({ date: addDays(item.date, 1 - day), source: url }); break }
        if (item.lunar.includes('除夕')) { dates.push({ date: addDays(item.date, 1), source: url }); break }
      }
    }
  }
  if (names.size !== 7) throw new Error('通知未包含全年七类节日，保留本地日历')
  const calendar: CalendarData = { schemaVersion: 1, region: 'CN', updatedAt: dateKey(new Date()), sources: [{ year, url, document: text.match(/国办发明电〔\d{4}〕\d+号/)?.[0] ?? `${year}年国务院办公厅放假通知` }], holidays, workdays: [...new Set(workdays)].sort() }
  if (!validateCalendar(calendar)) throw new Error('官方日历数据校验未通过')
  return { calendar, springs: { source: '中国科学院紫金山天文台、国务院公告及大陆政务公开资料', dates } }
}

export function mergeCalendar(base: CalendarBundle, update: CalendarBundle): CalendarBundle {
  const years = new Set(update.calendar.sources.map(source => source.year))
  const affected = (date: string) => years.has(Number(date.slice(0, 4)))
  const byDate = new Map(base.springs.dates.map(item => [item.date.slice(0, 4), item]))
  for (const item of update.springs.dates) byDate.set(item.date.slice(0, 4), item)
  const result: CalendarBundle = {
    calendar: { ...base.calendar, updatedAt: update.calendar.updatedAt, sources: [...base.calendar.sources.filter(s => !years.has(s.year)), ...update.calendar.sources].sort((a, b) => a.year - b.year), holidays: [...base.calendar.holidays.filter(h => !affected(h.start)), ...update.calendar.holidays].sort((a, b) => a.start.localeCompare(b.start)), workdays: [...new Set([...base.calendar.workdays.filter(d => !affected(d)), ...update.calendar.workdays])].sort() },
    springs: { source: update.springs.source, dates: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)) },
  }
  if (!validateCalendar(result.calendar) || !validateSprings(result.springs)) throw new Error('更新结果存在日期冲突')
  return result
}

export function shouldCheckCalendar(now: Date, status: UpdateStatus, data: CalendarData): boolean {
  if (!status.lastChecked || !Number.isFinite(Date.parse(status.lastChecked))) return true
  const elapsed = now.getTime() - Date.parse(status.lastChecked)
  if (elapsed < 0) return true
  if (status.failed) return elapsed >= DAY
  const today = dateKey(now)
  const year = Number(today.slice(0, 4))
  if (dateKey(new Date(status.lastChecked)).slice(0, 4) !== String(year)) return true
  return Number(today.slice(5, 7)) >= 9 && !data.sources.some(s => s.year === year + 1) && elapsed >= 7 * DAY
}

/** 开源索引仅用于定位通知 URL；日期和正月初一均解析中国政府网原文。 */
export async function fetchOfficialCalendar(year: number, load: TextLoader): Promise<CalendarBundle> {
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new Error('年份不合法')
  let index: unknown
  let lastError: unknown
  for (const host of ['https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master', 'https://raw.githubusercontent.com/NateScarlet/holiday-cn/master']) {
    try { index = JSON.parse(await load(`${host}/${year}.json`)); break } catch (error) { lastError = error }
  }
  if (!index || typeof index !== 'object') throw lastError ?? new Error('无法查找官方通知')
  const metadata = index as Record<string, unknown>
  if (metadata.year !== year || !Array.isArray(metadata.papers)) throw new Error('公告索引格式不正确')
  const urls = metadata.papers.filter(officialURL).slice(0, 3)
  if (!urls.length) throw new Error('尚无对应年份的国务院通知')
  for (const url of urls) {
    for (const address of [url, url.replace('https://www.gov.cn/', 'https://big5.www.gov.cn/gate/big5/www.gov.cn/')]) {
      try { return parseOfficialNotice(await load(address), year, url) } catch (error) { lastError = error }
    }
  }
  throw lastError ?? new Error('无法读取官方通知')
}

export function updateResult(base: CalendarBundle, update: CalendarBundle, now = new Date()): CalendarUpdate {
  const bundle = mergeCalendar(base, update)
  const year = update.calendar.sources[0]?.year
  return { ...bundle, checkedAt: now.toISOString(), message: `已核对 ${year} 年国务院放假通知` }
}
