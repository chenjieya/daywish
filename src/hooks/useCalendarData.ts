import { onUnmounted, ref } from 'vue'
import calendar from '../../shared/calendar.json'
import springs from '../../shared/springs.json'
import type { CalendarBundle, CalendarUpdate, UpdateStatus } from '../types/calendar'
import { mergeCalendar, shouldCheckCalendar, validateCalendar, validateSprings } from '../lib/calendar-update'
import { dateKey } from '../lib/dates'

const CACHE_KEY = 'daywish-calendar-v2'
/** 日历与状态独立于偏好设置保存；失败保留旧数据，不把联网失败伪装成更新成功。 */
export function useCalendarData() {
  const bundle = ref<CalendarBundle>({ calendar, springs })
  const checking = ref(false)
  const status = ref<UpdateStatus>({ lastChecked: null, lastSuccess: null, failed: false, message: '使用本地日历，可自动检查更新' })
  let controller: AbortController | undefined
  let disposed = false
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as unknown
    if (cached && typeof cached === 'object') {
      const value = cached as Record<string, unknown>
      const oldBundle = value.bundle as CalendarBundle | undefined
      if (oldBundle && validateCalendar(oldBundle.calendar) && validateSprings(oldBundle.springs)) bundle.value = mergeCalendar(bundle.value, oldBundle)
      const oldStatus = value.status as UpdateStatus | undefined
      if (oldStatus && (oldStatus.lastChecked === null || typeof oldStatus.lastChecked === 'string') && (oldStatus.lastSuccess === null || typeof oldStatus.lastSuccess === 'string') && typeof oldStatus.message === 'string' && typeof oldStatus.failed === 'boolean') status.value = oldStatus
    }
  } catch { status.value.message = '日历缓存无法读取，已使用内置数据' }
  function saveCache() { localStorage.setItem(CACHE_KEY, JSON.stringify({ bundle: bundle.value, status: status.value })) }
  async function checkUpdates(force = false): Promise<void> {
    if (checking.value || disposed || (!force && !shouldCheckCalendar(new Date(), status.value, bundle.value.calendar))) return
    checking.value = true
    const now = new Date()
    const today = dateKey(now)
    const year = Number(today.slice(0, 4)) + (Number(today.slice(5, 7)) >= 9 ? 1 : 0)
    try {
      let update: CalendarUpdate
      if (window.daywish?.checkCalendar) update = await window.daywish.checkCalendar(year)
      else {
        controller = new AbortController()
        const timeout = setTimeout(() => controller?.abort(), 55000)
        try {
          const response = await fetch(`${import.meta.env.BASE_URL}api/calendar-update?year=${year}`, { signal: controller.signal })
          if (!response.ok) throw new Error('无法连接日历数据源')
          update = await response.json() as CalendarUpdate
        } finally { clearTimeout(timeout) }
      }
      if (disposed) return
      if (!validateCalendar(update.calendar) || !validateSprings(update.springs) || !Number.isFinite(Date.parse(update.checkedAt))) throw new Error('日历数据校验失败')
      const merged = mergeCalendar(bundle.value, update)
      const nextStatus: UpdateStatus = { lastChecked: update.checkedAt, lastSuccess: update.checkedAt, message: update.message, failed: false }
      // 存储失败不声称已离线保存，当前会话继续沿用原数据。
      localStorage.setItem(CACHE_KEY, JSON.stringify({ bundle: merged, status: nextStatus }))
      bundle.value = merged
      status.value = nextStatus
    } catch {
      if (disposed) return
      status.value = { ...status.value, lastChecked: now.toISOString(), failed: true, message: '检查未完成，继续使用本地日历；可稍后重试' }
      try { saveCache() } catch { status.value.message = '检查未完成，且无法保存日历缓存' }
    } finally { checking.value = false; controller = undefined }
  }
  onUnmounted(() => { disposed = true; controller?.abort() })
  return { bundle, status, checking, checkUpdates }
}
