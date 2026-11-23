import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isReleaseManifest, packageUrl } from '../website/src/types.ts'
const actual = JSON.parse(readFileSync(new URL('../website/public/releases.json', import.meta.url), 'utf8'))
test('官网只开放已提供实际版本记录的平台', () => {
  assert(isReleaseManifest(actual))
  assert(actual.releases.some((r: {platform: string}) => r.platform === 'windows'))
  assert(!actual.releases.some((r: {platform: string}) => r.platform === 'macos'))
})
test('下载清单拒绝路径穿越、任意域名、无效大小或校验值', () => {
  for (const change of [{ file: '../private.exe' }, { file: 'https://evil.example/download.exe' }, { file: 'Daywish-9.0.0-Windows-x64-Setup.exe' }, { sourceTag: 123 }, { bytes: 0 }, { bytes: Infinity }, { sha256: 'invalid' }, { platform: 'macos' }, { version: 'latest' }]) {
    assert.equal(isReleaseManifest({ schema: 1, releases: [{ ...actual.releases[0], ...change }] }), false)
  }
})
test('官网接受本项目的 GitHub 正式下载链接，不接受其他来源', () => {
  const record = { ...actual.releases[0], downloadUrl: 'https://github.com/chenjieya/daywish/releases/download/windows-v0.2.2/' + actual.releases[0].file }
  assert(isReleaseManifest({ schema: 1, releases: [record] }))
  assert.equal(packageUrl(record), record.downloadUrl)
  assert.equal(isReleaseManifest({ schema: 1, releases: [{ ...record, downloadUrl: 'https://evil.example/file.exe' }] }), false)
  assert.equal(packageUrl(actual.releases[0]), '/downloads/' + actual.releases[0].file)
})

test('Mac 最低系统要求经过校验，历史记录可以缺省，新版可声明 Monterey', () => {
  const record = { ...actual.releases[0], platform: 'macos', file: 'Daywish-0.2.2-macOS-arm64.zip', minimumSystemVersion: '12.0' }
  assert(isReleaseManifest({ schema: 1, releases: [record] }))
  for (const minimumSystemVersion of ['12.x', '12', 12, null]) {
    assert.equal(isReleaseManifest({ schema: 1, releases: [{ ...record, minimumSystemVersion }] }), false)
  }
  assert.equal(isReleaseManifest({ schema: 1, releases: [{ ...actual.releases[0], minimumSystemVersion: '12.0' }] }), false)
})
