import test from 'node:test'
import assert from 'node:assert/strict'
import { compareVersions, isAppUpdateAction } from '../src/types/app-update.ts'
import { normalizeSettings } from '../src/types/settings.ts'

test('软件版本数字比较，不把双位版本误判或允许降级', () => {
  assert.equal(compareVersions('0.10.0', '0.9.9'), 1)
  assert.equal(compareVersions('0.3.0', '0.3.0'), 0)
  assert.equal(compareVersions('0.2.2', '0.3.0'), -1)
  for (const invalid of ['v0.3.0', '0.3.0-beta', '01.3.0', '999999999999999999.0.0', '../0.3.0']) assert.throws(() => compareVersions(invalid, '0.3.0'))
})
test('更新 IPC 只允许固定动作，不能传入安装路径或网址', () => {
  for (const valid of ['check', 'download', 'install']) assert(isAppUpdateAction(valid))
  for (const invalid of [null, {}, 'https://example.com', 'run', '../install.exe']) assert.equal(isAppUpdateAction(invalid), false)
})
test('旧设置默认开启软件检查，关闭后保留；日历开关相互独立', () => {
  assert.equal(normalizeSettings({ autoUpdate: false }).autoCheckAppUpdates, true)
  const settings = normalizeSettings({ autoCheckAppUpdates: false, autoUpdate: true, payday: 16 })
  assert.equal(settings.autoCheckAppUpdates, false)
  assert.equal(settings.autoUpdate, true)
  assert.equal(settings.payday, 16)
})
