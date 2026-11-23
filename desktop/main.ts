import { app, BrowserWindow, ipcMain, Menu, nativeImage, nativeTheme, net, powerMonitor, screen, Tray } from 'electron'
import { release } from 'node:os'
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeSettings } from '../src/types/settings.js'
import { getCalendarUpdate } from '../server/calendar-service.js'
import { clientSize, isViewMode, type ViewMode } from '../src/types/window.js'
import { AppUpdater } from './app-updater.js'
import electronUpdater from 'electron-updater'
import { isAppUpdateAction } from '../src/types/app-update.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
if (process.env.DAYWISH_USER_DATA) app.setPath('userData', process.env.DAYWISH_USER_DATA)
const storePath = join(app.getPath('userData'), 'settings.json')
let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let currentView: ViewMode = 'dashboard'
let dashboardPosition: { x: number; y: number } | undefined
let quitRequested = false
let quitTimer: ReturnType<typeof setTimeout> | undefined
let settings = normalizeSettings(null)
let position: { x: number; y: number } | undefined
let moveTimer: ReturnType<typeof setTimeout> | undefined
let writes: Promise<void> = Promise.resolve()
let settingsQueue: Promise<unknown> = Promise.resolve()
const devUrl = !app.isPackaged ? process.env.DAYWISH_DEV_URL : undefined
let material = '半透明玻璃'
let softwareUpdater: AppUpdater | undefined
let installOnQuit = false

function save(): Promise<void> {
  const content = JSON.stringify({ appearanceVersion: 2, settings, position }, null, 2)
  const operation = writes.catch(() => {}).then(async () => {
    await mkdir(dirname(storePath), { recursive: true })
    await writeFile(`${storePath}.tmp`, content, 'utf8')
    await rename(`${storePath}.tmp`, storePath)
  })
  writes = operation
  return operation
}
function validPosition(value: unknown): value is { x: number; y: number } {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  return typeof p.x === 'number' && Number.isFinite(p.x) && typeof p.y === 'number' && Number.isFinite(p.y)
}
function restorePosition(saved?: { x: number; y: number }): void {
  if (!win) return
  const bounds = win.getBounds()
  const candidate = saved ?? { x: bounds.x, y: bounds.y }
  const area = screen.getDisplayMatching({ ...candidate, width: bounds.width, height: bounds.height }).workArea
  win.setPosition(Math.round(Math.max(area.x, Math.min(candidate.x, area.x + area.width - bounds.width))), Math.round(Math.max(area.y, Math.min(candidate.y, area.y + area.height - bounds.height))))
}
function show(): void {
  if (win?.isMinimized()) win.restore()
  win?.show()
  win?.focus()
}
async function finishQuit(): Promise<void> {
  if (quitting) return
  quitting = true
  if (quitTimer) clearTimeout(quitTimer)
  if (moveTimer) clearTimeout(moveTimer)
  await settingsQueue.catch(() => {})
  if (win && !win.isDestroyed()) {
    const [x = 0, y = 0] = win.getPosition()
    position = currentView === 'panel' && dashboardPosition ? dashboardPosition : { x, y }
  }
  try { await save() } catch (error) {
    console.error('退出时无法保存设置', error)
    if (installOnQuit) {
      quitting = false; quitRequested = false; installOnQuit = false
      win?.webContents.send('storage-error', '更新前无法保存设置')
      return
    }
  }
  if (installOnQuit && softwareUpdater) { softwareUpdater.install(); return }
  app.quit()
}
function applySettings(): void {
  if (!win) return
  win.setAlwaysOnTop(settings.alwaysOnTop)
}
function resizeView(next: ViewMode): { width: number; height: number } {
  if (!win || win.isDestroyed()) throw new Error('窗口未就绪')
  if (currentView !== 'panel' && next === 'panel') {
    const [x = 0, y = 0] = win.getPosition()
    dashboardPosition = { x, y }
  }
  const returning = currentView === 'panel' && next !== 'panel'
  currentView = next
  const size = clientSize(next)
  win.setContentSize(size.width, size.height)
  let [width, height] = win.getContentSize()
  if (width !== size.width || height !== size.height) {
    win.setContentBounds({ ...win.getContentBounds(), ...size })
    const actual = win.getContentSize()
    width = actual[0]
    height = actual[1]
  }
  restorePosition(returning ? dashboardPosition : undefined)
  if (returning) dashboardPosition = undefined
  if (width !== size.width || height !== size.height) throw new Error('系统窗口尺寸与当前视图不一致')
  return size
}
function trayMenu(): void {
  tray?.setContextMenu(Menu.buildFromTemplate([
    { label: '打开好日将至', click: show },
    { label: '设置', click: () => { show(); win?.webContents.send('open-settings') } },
    { label: '检查软件更新…', click: () => { show(); win?.webContents.send('open-settings'); void softwareUpdater?.check(true) } },
    { type: 'separator' },
    { label: '退出好日将至', click: () => app.quit() },
  ]))
}
function createWindow(): void {
  const windowsBuild = Number(release().split('.')[2] ?? 0)
  const acrylic = process.platform === 'win32' && windowsBuild >= 22621
  // Acrylic 使用系统背景材质，不能再创建 layered 透明窗口；浅色底保证禁用透明时仍可读。
  nativeTheme.themeSource = 'light'
  material = acrylic ? '浅色磨砂玻璃' : '浅色磨砂外观（系统不支持背景模糊）'
  currentView = settings.compact ? 'compact' : 'dashboard'
  const initialSize = clientSize(currentView)
  win = new BrowserWindow({
    ...initialSize, useContentSize: true, frame: false, transparent: false, roundedCorners: true,
    backgroundMaterial: acrylic ? 'acrylic' : 'none',
    backgroundColor: acrylic ? '#00000000' : '#f2f5f7', resizable: false, maximizable: false, fullscreenable: false,
    show: false, skipTaskbar: true, title: '好日将至', icon: join(root, 'dist/icon.png'),
    webPreferences: { preload: join(root, 'dist-electron/desktop/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: true, spellcheck: false },
  })
  const area = screen.getPrimaryDisplay().workArea
  const bounds = win.getBounds()
  restorePosition(position ?? { x: area.x + area.width - bounds.width - 20, y: area.y + area.height - bounds.height - 20 })
  applySettings()
  win.webContents.setZoomFactor(1)
  win.setMenu(null)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', event => event.preventDefault())
  win.once('ready-to-show', () => {
    // 初始导航完成后再访问页面 frame，避免锁定缩放时 frame 已被替换。
    void win?.webContents.setVisualZoomLevelLimits(1, 1).catch(error => console.error('无法锁定窗口缩放', error))
    // 桌面面板保持可见，后台驻留不抢焦点；托盘不可用时保留任务栏入口。
    if (!tray) { win?.setSkipTaskbar(false); show(); return }
    win?.showInactive()
  })
  if (process.platform === 'win32') win.hookWindowMessage(0x001e, () => win?.webContents.send('refresh-date'))
  win.on('close', event => { if (!quitting && tray) { event.preventDefault(); win?.hide() } })
  win.on('move', () => {
    if (moveTimer) clearTimeout(moveTimer)
    moveTimer = setTimeout(() => {
      if (!win || win.isDestroyed() || currentView === 'panel') return
      const [x = 0, y = 0] = win.getPosition()
      position = { x, y }
      void save().catch(error => win?.webContents.send('storage-error', String(error)))
    }, 500)
  })
  const load = devUrl ? win.loadURL(devUrl) : win.loadFile(join(root, 'dist/index.html'))
  void load.catch(error => { console.error('无法加载界面', error); app.quit() })
  const icon = nativeImage.createFromPath(join(root, 'dist/icon.png'))
  if (!icon.isEmpty()) {
    tray = new Tray(icon.resize({ width: 32, height: 32 }))
    tray.setToolTip('好日将至 · 每一天，都有盼头')
    tray.on('double-click', show)
    tray.on('click', show)
    trayMenu()
  }
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', show)
  void app.whenReady().then(async () => {
    app.setAppUserModelId('com.daywish.desktop')
    let loadError = false
    try {
      const data = JSON.parse(await readFile(storePath, 'utf8')) as { appearanceVersion?: unknown; settings?: unknown; position?: unknown }
      settings = normalizeSettings(data.settings)
      // 首次升级到透明小窗时去掉旧版白底；后续保留用户自己设置的衬底浓度。
      if (data.appearanceVersion !== 2) settings.opacity = 0
      if (validPosition(data.position)) position = data.position
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') loadError = true
    }
    // 开机启动以操作系统实际状态为准，开发模式不可注册开发工具路径。
    if (app.isPackaged) settings.launchAtLogin = app.getLoginItemSettings().openAtLogin
    const state = () => ({ settings, native: true, material, loadError, canLaunchAtLogin: app.isPackaged })
    softwareUpdater = new AppUpdater(new electronUpdater.NsisUpdater(), app.getVersion(), app.isPackaged, update => {
      if (win && !win.webContents.isDestroyed()) win.webContents.send('app-update-state', update)
    }, () => { quitting = false; quitRequested = false; installOnQuit = false })
    const trustedWindow = (event: Electron.IpcMainInvokeEvent) => {
      if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('无效更新请求来源')
    }
    ipcMain.handle('read-app-update', event => { trustedWindow(event); return softwareUpdater?.snapshot() })
    ipcMain.handle('app-update-action', async (event, action: unknown) => {
      trustedWindow(event)
      if (!isAppUpdateAction(action) || !softwareUpdater) throw new Error('无效更新操作')
      if (action !== 'install') { await softwareUpdater.action(action); return }
      if (softwareUpdater.snapshot().phase !== 'ready') throw new Error('更新尚未准备好')
      installOnQuit = true
      app.quit()
    })
    ipcMain.handle('read-state', () => state())
    ipcMain.handle('set-view-mode', (event, mode: unknown) => {
      if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || !isViewMode(mode)) throw new Error('无效窗口视图')
      return resizeView(mode)
    })
    ipcMain.handle('check-calendar', (event, year: unknown) => {
      if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || typeof year !== 'number' || !Number.isInteger(year) || year < 2020 || year > 2100) throw new Error('无效日历请求')
      return getCalendarUpdate(year, async url => {
        const response = await net.fetch(url, { signal: AbortSignal.timeout(12000) })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const text = await response.text()
        if (text.length > 2_000_000) throw new Error('日历响应过大')
        return text
      })
    })
    ipcMain.handle('save-settings', (event, input: unknown) => {
      if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('无效窗口')
      const next = normalizeSettings(input)
      const operation = settingsQueue.catch(() => {}).then(async () => {
        const old = settings
        if (next.launchAtLogin !== old.launchAtLogin) {
          if (!app.isPackaged) throw new Error('开机启动请在安装版本中设置')
          app.setLoginItemSettings({ openAtLogin: next.launchAtLogin, path: process.execPath })
          if (app.getLoginItemSettings().openAtLogin !== next.launchAtLogin) throw new Error('系统未允许修改开机启动')
        }
        settings = next
        try { await save() } catch (error) { settings = old; throw error }
        applySettings()
        if (next.autoCheckAppUpdates !== old.autoCheckAppUpdates) softwareUpdater?.configure(next.autoCheckAppUpdates)
        loadError = false
        return settings
      })
      settingsQueue = operation
      return operation
    })
    ipcMain.on('window-action', (event, action: unknown) => {
      if (event.sender !== win?.webContents) return
      if (action === 'hide') { if (tray) win.hide(); else win.minimize() }
      if (action === 'minimize') win.minimize()
      if (action === 'quit') app.quit()
      if (action === 'quit-ready' && quitRequested) void finishQuit()
    })
    createWindow()
    softwareUpdater.configure(settings.autoCheckAppUpdates)
    powerMonitor.on('resume', () => { win?.webContents.send('refresh-date'); void softwareUpdater?.check(false) })
    screen.on('display-removed', () => restorePosition())
    screen.on('display-metrics-changed', () => restorePosition())
  })
  app.on('activate', show)
  app.on('before-quit', event => {
    if (quitting) return
    event.preventDefault()
    if (quitRequested) return
    quitRequested = true
    if (!win || win.webContents.isDestroyed() || win.webContents.isLoading()) { void finishQuit(); return }
    win.webContents.send('prepare-quit')
    quitTimer = setTimeout(() => { void finishQuit() }, 1500)
  })
  app.on('will-quit', () => { softwareUpdater?.dispose(); tray?.destroy() })
  app.on('window-all-closed', () => { if (quitting) app.quit() })
}
