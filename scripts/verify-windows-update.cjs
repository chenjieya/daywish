// 在独立 CI 配置目录验证真实更新源和下载；不调用安装程序，不改变用户安装。
const electron = require('electron')
if (typeof electron === 'string') {
  const { spawnSync } = require('node:child_process')
  const environment = { ...process.env }
  delete environment.ELECTRON_RUN_AS_NODE
  const result = spawnSync(electron, [__filename], { env: environment, stdio: 'inherit', windowsHide: true, timeout: 240_000 })
  if (result.error) console.error(result.error.message)
  process.exit(result.status ?? 1)
} else {
  const { app, net } = electron
  const { mkdtempSync, writeFileSync, readFileSync, statSync } = require('node:fs')
  const { tmpdir } = require('node:os')
  const { join } = require('node:path')
  const { createHash } = require('node:crypto')
  const assert = require('node:assert/strict')
  const { NsisUpdater } = require('electron-updater')
  const { version } = require('../package.json')
  const directory = mkdtempSync(join(tmpdir(), 'daywish-update-smoke-'))
  app.setPath('userData', directory)
  app.setPath('cache', directory)
  // 仅本检查进程模拟较旧客户端，正式应用没有版本或更新源覆盖开关。
  app.getVersion = () => '0.0.0'
  const deadline = setTimeout(() => { console.error('::error::真实更新下载检查超时'); app.exit(1) }, 210_000)
  void app.whenReady().then(async () => {
    const response = await net.fetch('https://daywish.alvis.org.cn/releases.json', { signal: AbortSignal.timeout(20_000) })
    assert(response.ok)
    const manifest = await response.json()
    const record = manifest.releases.find(item => item.platform === 'windows' && item.version === version)
    assert(record, '正式官网尚无当前 Windows 版本')
    const config = join(directory, 'app-update.yml')
    writeFileSync(config, JSON.stringify({ provider: 'generic', url: 'https://daywish.alvis.org.cn/updates/windows/', updaterCacheDirName: 'daywish-update-smoke' }))
    const updater = new NsisUpdater()
    updater.updateConfigPath = config
    updater.forceDevUpdateConfig = true
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = false
    updater.allowDowngrade = false
    updater.allowPrerelease = false
    updater.disableDifferentialDownload = true
    updater.disableWebInstaller = true
    const checked = await updater.checkForUpdates()
    assert.equal(checked.updateInfo.version, version)
    const files = await updater.downloadUpdate()
    assert.equal(files.length, 1)
    assert.equal(statSync(files[0]).size, record.bytes)
    assert.equal(createHash('sha256').update(readFileSync(files[0])).digest('hex'), record.sha256)
    console.log('::notice title=Windows 真实更新下载检查通过::electron-updater 已从正式更新源发现 v' + version + '，完成下载及 SHA-512、SHA-256 校验；未执行安装')
    clearTimeout(deadline)
    app.exit(0)
  }).catch(error => {
    const message = String(error.message).replaceAll('%', '%25').replaceAll('\n', '%0A').replaceAll('\r', '%0D')
    console.error('::error title=Windows 真实更新下载检查失败::' + message)
    clearTimeout(deadline)
    app.exit(1)
  })
}
