import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { AppUpdater, type UpdateDriver } from '../desktop/app-updater.ts'

class Driver extends EventEmitter implements UpdateDriver {
  autoDownload = true; autoInstallOnAppQuit = true; allowDowngrade = true; allowPrerelease = true
  disableWebInstaller = false; disableDifferentialDownload = false
  checks = 0; downloads = 0; installs = 0; failDownload = false; failInstall = false
  setFeedURL() {}
  async checkForUpdates() { this.checks++; this.emit('checking-for-update'); this.emit('update-available', { version: '0.4.0', releaseNotes: '更新说明' }) }
  async downloadUpdate() {
    this.downloads++
    if (this.failDownload) throw new Error('network')
    this.emit('download-progress', { percent: 50 })
    this.emit('update-downloaded', {})
  }
  quitAndInstall(silent: boolean, runAfter: boolean) {
    assert(silent && runAfter)
    if (this.failInstall) throw new Error('installer')
    this.installs++
  }
}

test('检查不触发下载，重复下载或检查不会覆盖已就绪的安装包', async () => {
  const driver = new Driver()
  const updater = new AppUpdater(driver, '0.3.0', true, () => {}, () => {})
  assert.equal(driver.autoDownload, false)
  assert.equal(driver.autoInstallOnAppQuit, false)
  assert.throws(() => updater.install())
  await updater.check(true)
  assert.equal(updater.snapshot().phase, 'available')
  assert.equal(driver.downloads, 0)
  await updater.action('download')
  assert.equal(updater.snapshot().phase, 'ready')
  await updater.action('download'); await updater.check(true)
  assert.equal(driver.downloads, 1); assert.equal(driver.checks, 1)
  updater.install()
  assert.equal(driver.installs, 1)
  assert.throws(() => updater.install())
  updater.dispose()
})
test('下载失败后可重新检查并成功重试，安装失败恢复可操作状态', async () => {
  const driver = new Driver()
  let restored = false
  const updater = new AppUpdater(driver, '0.3.0', true, () => {}, () => { restored = true })
  await updater.check(true)
  driver.failDownload = true
  await updater.action('download')
  assert.equal(updater.snapshot().phase, 'error')
  driver.failDownload = false
  await updater.check(true); await updater.action('download')
  assert.equal(updater.snapshot().phase, 'ready')
  driver.failInstall = true
  updater.install()
  assert(restored); assert.equal(updater.snapshot().phase, 'error')
  updater.dispose()
})
test('开发版禁用更新；关闭自动检查仍可手动检查，自动检查按天限频', async () => {
  const driver = new Driver()
  const preview = new AppUpdater(driver, '0.3.0', false, () => {}, () => {})
  await preview.check(true)
  assert.equal(driver.checks, 0)
  preview.dispose()
  const updater = new AppUpdater(driver, '0.3.0', true, () => {}, () => {})
  updater.configure(false)
  await updater.check(false)
  assert.equal(driver.checks, 0)
  await updater.check(true)
  assert.equal(driver.checks, 1)
  updater.configure(true)
  await updater.check(false)
  assert.equal(driver.checks, 1)
  updater.dispose()
  await updater.check(true)
  assert.equal(driver.checks, 1)
})
