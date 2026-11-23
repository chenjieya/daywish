import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isReleaseManifest } from '../website/src/types.ts'
const actual = JSON.parse(readFileSync(new URL('../website/public/releases.json', import.meta.url), 'utf8'))
test('官网只开放已提供实际版本记录的平台', () => {
  assert(isReleaseManifest(actual))
  assert(actual.releases.some((r: {platform: string}) => r.platform === 'windows'))
  assert(!actual.releases.some((r: {platform: string}) => r.platform === 'macos'))
})
test('下载清单拒绝路径穿越、任意域名、无效大小或校验值', () => {
  for (const change of [{ file: '../private.exe' }, { file: 'https://evil.example/download.exe' }, { file: 'Daywish-9.0.0-Windows-x64-Setup.exe' }, { bytes: 0 }, { bytes: Infinity }, { sha256: 'invalid' }, { platform: 'macos' }, { version: 'latest' }]) {
    assert.equal(isReleaseManifest({ schema: 1, releases: [{ ...actual.releases[0], ...change }] }), false)
  }
})
