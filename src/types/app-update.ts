export type AppUpdatePhase = 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'ready' | 'installing' | 'error' | 'disabled'
export type AppUpdateAction = 'check' | 'download' | 'install'
export interface AppUpdateState {
  phase: AppUpdatePhase
  currentVersion: string
  version?: string
  notes: string[]
  percent: number
  message: string
}

export function isAppUpdateAction(value: unknown): value is AppUpdateAction {
  return value === 'check' || value === 'download' || value === 'install'
}

/** 版本按数字比较，防止把 0.10.0 当成比 0.9.0 更旧。仅分发正式三段版本。 */
export function compareVersions(left: string, right: string): number {
  const parse = (value: string) => {
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw new Error('无效正式版本号')
    const parts = value.split('.').map(Number)
    if (!parts.every(Number.isSafeInteger)) throw new Error('版本号超出范围')
    return parts
  }
  const a = parse(left), b = parse(right)
  for (let index = 0; index < 3; index++) {
    const difference = a[index]! - b[index]!
    if (difference) return Math.sign(difference)
  }
  return 0
}
