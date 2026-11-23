import type { AppUpdateAction, AppUpdateState } from '../src/types/app-update.ts'
import { compareVersions } from '../src/types/app-update.ts'

/** 与更新框架的窄接口，便于不运行安装程序地验证更新状态与失败恢复。 */
export interface UpdateDriver {
  autoDownload: boolean; autoInstallOnAppQuit: boolean; allowDowngrade: boolean; allowPrerelease: boolean
  disableWebInstaller: boolean; disableDifferentialDownload: boolean
  setFeedURL(options: { provider: 'generic'; url: string }): void
  on(event: 'checking-for-update', callback: () => void): void
  on(event: 'update-not-available' | 'update-downloaded', callback: () => void): void
  on(event: 'update-available', callback: (info: { version: string; releaseNotes?: string | unknown[] | null }) => void): void
  on(event: 'download-progress', callback: (info: { percent: number }) => void): void
  on(event: 'error', callback: (error: Error) => void): void
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(silent: boolean, runAfter: boolean): void
}

/** 只在主进程连接固定更新源；渲染进程只能发出检查、下载或安装动作。 */
export class AppUpdater {
  private timer?: ReturnType<typeof setInterval>
  private startup?: ReturnType<typeof setTimeout>
  private lastChecked = 0
  private enabled = true
  private disposed = false
  private state: AppUpdateState
  private readonly updater: UpdateDriver
  private readonly version: string
  private readonly packaged: boolean
  private readonly changed: (state: AppUpdateState) => void
  private readonly installFailed: () => void
  constructor(updater: UpdateDriver, version: string, packaged: boolean, changed: (state: AppUpdateState) => void, installFailed: () => void) {
    this.updater = updater; this.version = version; this.packaged = packaged; this.changed = changed; this.installFailed = installFailed
    this.state = { phase: packaged ? 'idle' : 'disabled', currentVersion: version, notes: [], percent: 0, message: packaged ? '可检查软件新版本' : '开发预览不下载或安装软件更新' }
    updater.setFeedURL({ provider: 'generic', url: 'https://daywish.alvis.org.cn/updates/windows/' })
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = false
    updater.allowDowngrade = false
    updater.allowPrerelease = false
    updater.disableWebInstaller = true
    // 官网和 GitHub 均提供完整安装包，避免旧版本 blockmap 缺失导致跨源下载失败。
    updater.disableDifferentialDownload = true
    updater.on('checking-for-update', () => this.set({ phase: 'checking', message: '正在检查软件新版本…', percent: 0 }))
    updater.on('update-not-available', () => this.set({ phase: 'latest', message: '当前已是最新版本', version: undefined, notes: [] }))
    updater.on('update-available', info => {
      try {
        if (compareVersions(info.version, this.version) <= 0) throw new Error('更新版本不高于当前版本')
        const notes = typeof info.releaseNotes === 'string' ? info.releaseNotes.split('\n').filter(Boolean) : []
        this.set({ phase: 'available', version: info.version, notes, percent: 0, message: `发现新版本 v${info.version}` })
      } catch { this.fail() }
    })
    updater.on('download-progress', info => this.set({ phase: 'downloading', percent: Math.max(0, Math.min(100, info.percent)), message: '正在下载更新，仍可正常使用小窗' }))
    updater.on('update-downloaded', () => this.set({ phase: 'ready', percent: 100, message: '更新已下载并校验，重启后生效' }))
    updater.on('error', error => { console.error('软件更新失败', error); this.fail() })
  }
  snapshot(): AppUpdateState { return { ...this.state, notes: [...this.state.notes] } }
  private set(patch: Partial<AppUpdateState>): void {
    if (this.disposed) return
    this.state = { ...this.state, ...patch }
    this.changed(this.snapshot())
  }
  private fail(): void {
    if (this.state.phase === 'installing') this.installFailed()
    this.set({ phase: 'error', percent: 0, message: '更新未完成，请检查网络或磁盘空间后重试；当前版本仍可使用' })
  }
  configure(enabled: boolean): void {
    this.enabled = enabled
    if (this.startup) clearTimeout(this.startup)
    if (this.timer) clearInterval(this.timer)
    if (!enabled || !this.packaged) return
    this.startup = setTimeout(() => { void this.check(false) }, 15_000)
    this.timer = setInterval(() => { void this.check(false) }, 60 * 60 * 1000)
    this.timer.unref()
    this.startup.unref()
  }
  async check(force: boolean): Promise<void> {
    if (this.disposed || !this.packaged || ['checking', 'downloading', 'ready', 'installing'].includes(this.state.phase)) return
    if (!force && (!this.enabled || Date.now() - this.lastChecked < 24 * 60 * 60 * 1000)) return
    this.lastChecked = Date.now()
    try { await this.updater.checkForUpdates() } catch { this.fail() }
  }
  async action(action: Exclude<AppUpdateAction, 'install'>): Promise<AppUpdateState> {
    if (action === 'check') await this.check(true)
    else if (this.state.phase === 'available') {
      this.set({ phase: 'downloading', percent: 0, message: '正在下载更新，仍可正常使用小窗' })
      try { await this.updater.downloadUpdate() } catch { this.fail() }
    }
    return this.snapshot()
  }
  install(): void {
    if (this.state.phase !== 'ready') throw new Error('更新尚未完成下载')
    this.set({ phase: 'installing', message: '正在重启并更新…' })
    try { this.updater.quitAndInstall(true, true) } catch { this.fail() }
  }
  dispose(): void {
    this.disposed = true
    if (this.startup) clearTimeout(this.startup)
    if (this.timer) clearInterval(this.timer)
  }
}
