import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { defaultSettings, normalizeSettings } from '../types/settings'
import { dateKey, nextHoliday, nextPayday, nextSpring, nextMidnight, paydayProgress, holidayProgress, springProgress } from '../lib/dates'
import { useCalendarData } from './useCalendarData'

export function useDaywish() {
  const settings = ref({ ...defaultSettings })
  const today = ref(dateKey(new Date()))
  const loading = ref(true)
  const error = ref('')
  const material = ref('浏览器效果预览')
  const native = !!window.daywish
  const canLaunchAtLogin = ref(false)
  const { bundle, status: calendarStatus, checking, checkUpdates } = useCalendarData()
  const data = computed(() => bundle.value.calendar)
  let timer: ReturnType<typeof setTimeout> | undefined
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let saving = Promise.resolve()
  const unsubscribers: (() => void)[] = []
  let disposed = false

  function refresh() {
    today.value = dateKey(new Date(), settings.value.timeZone)
    if (timer) clearTimeout(timer)
    timer = setTimeout(refresh, Math.max(1000, nextMidnight(new Date(), settings.value.timeZone) - Date.now()))
    if (!loading.value && settings.value.autoUpdate) void checkUpdates()
  }
  watch(() => settings.value.timeZone, refresh)
  watch(() => settings.value.autoUpdate, enabled => { if (enabled && !loading.value) void checkUpdates() })
  function storageError() { error.value = '设置未能保存，请检查磁盘空间与目录权限。' }
  const stopWatch = watch(settings, () => {
    if (loading.value) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { void persist() }, 180)
  }, { deep: true, flush: 'sync' })
  function persist(): Promise<void> {
    const snapshot = normalizeSettings(settings.value)
    const operation = saving.catch(() => {}).then(async () => {
      try {
        if (window.daywish) await window.daywish.saveSettings(snapshot)
        else localStorage.setItem('daywish-settings-v1', JSON.stringify(snapshot))
        if (!disposed) error.value = ''
      } catch (cause) {
        if (!disposed) error.value = `设置未保存：${cause instanceof Error ? cause.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : '请检查磁盘空间与目录权限'}`
      }
    })
    saving = operation
    return operation
  }
  onMounted(async () => {
    refresh()
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    if (window.daywish) unsubscribers.push(window.daywish.on('refresh-date', refresh), window.daywish.on('storage-error', storageError))
    if (window.daywish) unsubscribers.push(window.daywish.on('prepare-quit', () => {
      if (saveTimer) clearTimeout(saveTimer)
      void persist().finally(() => window.daywish?.windowAction('quit-ready'))
    }))
    try {
      if (window.daywish) {
        const state = await window.daywish.readState()
        if (disposed) return
        settings.value = normalizeSettings(state.settings)
        material.value = state.material
        canLaunchAtLogin.value = state.canLaunchAtLogin
        if (state.loadError) error.value = '原设置文件无法读取，已恢复默认值。修改设置后重新保存。'
      } else {
        const saved = localStorage.getItem('daywish-settings-v1')
        if (saved) settings.value = normalizeSettings(JSON.parse(saved))
      }
    } catch { error.value = '无法读取设置，已使用默认值。' }
    finally { loading.value = false; if (!disposed) refresh() }
  })
  onUnmounted(() => {
    disposed = true
    stopWatch()
    if (timer) clearTimeout(timer)
    if (saveTimer) { clearTimeout(saveTimer); void persist() }
    document.removeEventListener('visibilitychange', refresh)
    window.removeEventListener('focus', refresh)
    unsubscribers.forEach(unsubscribe => unsubscribe())
  })
  const payday = computed(() => nextPayday(today.value, settings.value, data.value))
  const holiday = computed(() => nextHoliday(today.value, data.value))
  const spring = computed(() => { try { return nextSpring(today.value, bundle.value.springs) } catch { return null } })
  const upcoming = computed(() => data.value.holidays.filter(h => h.end >= today.value).slice(0, 7))
  const dateLabel = computed(() => new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${today.value}T12:00:00Z`)))
  const zoneLabel = computed(() => settings.value.timeZone === 'beijing' ? '北京时间' : '系统时区')
  const progress = computed(() => ({ payday: paydayProgress(today.value, settings.value, data.value), holiday: holidayProgress(today.value, data.value), spring: springProgress(today.value, bundle.value.springs) }))
  return { settings, today, loading, error, material, native, canLaunchAtLogin, payday, holiday, spring, upcoming, dateLabel, data, persist, progress, zoneLabel, calendarStatus, checking, checkUpdates }
}
