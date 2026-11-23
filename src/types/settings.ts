export type PaydayRule = 'exact' | 'previous' | 'next'
export type Theme = 'white'
export type TimeZoneMode = 'beijing' | 'system'

export interface Settings {
  payday: number // 0 表示月末；短月份自动取最后一天。
  paydayRule: PaydayRule
  opacity: number // 白色衬底浓度；0 不叠白底，文字不随之变淡。
  frostOpacity: number // Windows 磨砂底色浓度，保留可读性下限；与 Mac 玻璃衬底独立。
  theme: Theme
  alwaysOnTop: boolean
  launchAtLogin: boolean
  compact: boolean
  timeZone: TimeZoneMode
  autoUpdate: boolean
  autoCheckAppUpdates: boolean
}

export const defaultSettings: Settings = {
  payday: 10, paydayRule: 'exact', opacity: 0, frostOpacity: 84, theme: 'white',
  alwaysOnTop: false, launchAtLogin: false, compact: false, timeZone: 'beijing', autoUpdate: true, autoCheckAppUpdates: true,
}

/** IPC 和本地文件均是不可信输入；逐字段校验，不展开任意对象。 */
export function normalizeSettings(value: unknown): Settings {
  const v = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
  return {
    payday: typeof v.payday === 'number' && Number.isInteger(v.payday) && v.payday >= 0 && v.payday <= 31 ? v.payday : 10,
    paydayRule: v.paydayRule === 'previous' || v.paydayRule === 'next' ? v.paydayRule : 'exact',
    opacity: typeof v.opacity === 'number' && Number.isFinite(v.opacity) ? Math.max(0, Math.min(95, v.opacity)) : 0,
    frostOpacity: typeof v.frostOpacity === 'number' && Number.isFinite(v.frostOpacity) ? Math.max(70, Math.min(96, v.frostOpacity)) : 84,
    theme: 'white',
    alwaysOnTop: v.alwaysOnTop === true, launchAtLogin: v.launchAtLogin === true, compact: v.compact === true,
    timeZone: v.timeZone === 'system' ? 'system' : 'beijing', autoUpdate: v.autoUpdate !== false,
    autoCheckAppUpdates: v.autoCheckAppUpdates !== false,
  }
}
