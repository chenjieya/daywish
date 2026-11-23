import { execFileSync } from 'node:child_process'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const record = JSON.parse(readFileSync('publication/record.json', 'utf8'))
const platform = process.env.PLATFORM
const commit = process.env.GITHUB_SHA
if (!['windows', 'macos'].includes(platform) || platform !== record.platform || !/^[a-f0-9]{40}$/.test(commit ?? '')) throw new Error('发布上下文无效')
const tag = `${platform}-v${record.version}`
const gh = args => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
let existing
try { existing = JSON.parse(gh(['release', 'view', tag, '--json', 'targetCommitish,isDraft'])) } catch (error) {
  if (!String(error.stderr).includes('release not found')) throw new Error('无法确认 GitHub Release 状态，请检查权限与网络')
}
if (existing) {
  assert.equal(existing.targetCommitish, commit, '已有版本来自不同提交，请增加版本号')
  if (!existing.isDraft) {
    const temp = mkdtempSync(join(tmpdir(), 'daywish-release-'))
    try {
      gh(['release', 'download', tag, '--pattern', 'record.json', '--dir', temp])
      assert.deepEqual(JSON.parse(readFileSync(join(temp, 'record.json'), 'utf8')), record, '版本内容已变化，请增加版本号')
      console.log(`复用已发布的 ${tag}，继续同步官网`)
    } finally { rmSync(temp, { recursive: true, force: true }) }
  } else {
    gh(['release', 'upload', tag, `publication/${record.file}`, 'publication/record.json', 'publication/release-notes.txt', '--clobber'])
  }
} else {
  gh(['release', 'create', tag, `publication/${record.file}`, 'publication/record.json', 'publication/release-notes.txt', '--target', commit, '--title', `好日将至 ${platform} v${record.version}`, '--notes-file', 'publication/release-notes.txt', '--draft', '--latest=false'])
}
if (!existing || existing.isDraft) {
  gh(['release', 'edit', tag, '--draft=false', '--latest=false'])
  console.log(`已发布 ${tag}`)
}
