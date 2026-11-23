import { execFileSync } from 'node:child_process'
import { readFileSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { createHash, createPublicKey, verify } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const directory = process.argv[2] || 'publication'
const record = JSON.parse(readFileSync(join(directory, 'record.json'), 'utf8'))
const platform = process.env.PLATFORM
const commit = process.env.GITHUB_SHA
if (!['windows', 'macos'].includes(platform) || platform !== record.platform || !/^[a-f0-9]{40}$/.test(commit ?? '')) throw new Error('发布上下文无效')
const tag = `${platform}-v${record.version}`
const gh = args => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const repo = process.env.GITHUB_REPOSITORY
if (repo !== 'chenjieya/daywish' || !/^Daywish-[A-Za-z0-9.-]+\.(exe|zip)$/.test(record.file)) throw new Error('发布仓库或文件名不匹配')
const bytes = readFileSync(join(directory, record.file))
assert.equal(statSync(join(directory, record.file)).size, record.bytes, '实际附件大小不符')
assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256, '实际附件 SHA-256 不符')
if (record.sha512) assert.equal(createHash('sha512').update(bytes).digest('base64'), record.sha512, '实际附件 SHA-512 不符')
if (record.edSignature) {
  const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(record.publicKey, 'base64')]), format: 'der', type: 'spki' })
  assert(verify(null, bytes, key, Buffer.from(record.edSignature, 'base64')), 'Mac 实际附件验签失败')
}
// 真正的来源以标签指向为准，不能用 Release 的 targetCommitish 元数据替代。
let ref
try { ref = JSON.parse(gh(['api', `repos/${repo}/git/ref/tags/${tag}`])).object } catch (error) {
  if (!String(error.stderr).includes('404')) throw error
  gh(['api', '--method', 'POST', `repos/${repo}/git/refs`, '-f', `ref=refs/tags/${tag}`, '-f', `sha=${commit}`])
  ref = JSON.parse(gh(['api', `repos/${repo}/git/ref/tags/${tag}`])).object
}
for (let depth = 0; ref.type === 'tag' && depth < 4; depth++) ref = JSON.parse(gh(['api', `repos/${repo}/git/tags/${ref.sha}`])).object
assert.equal(ref.type, 'commit', '版本标签未指向提交')
assert.equal(ref.sha, commit, '版本标签与已构建来源不一致，禁止重新指向标签')
let existing
try { existing = JSON.parse(gh(['release', 'view', tag, '--json', 'targetCommitish,isDraft'])) } catch (error) {
  if (!String(error.stderr).includes('release not found')) throw new Error('无法确认 GitHub Release 状态，请检查权限与网络')
}
if (existing) {
  if (!existing.isDraft) {
    const temp = mkdtempSync(join(tmpdir(), 'daywish-release-'))
    try {
      gh(['release', 'download', tag, '--pattern', 'record.json', '--dir', temp])
      assert.deepEqual(JSON.parse(readFileSync(join(temp, 'record.json'), 'utf8')), record, '版本内容已变化，请增加版本号')
      console.log(`复用已发布的 ${tag}，继续同步官网`)
    } finally { rmSync(temp, { recursive: true, force: true }) }
  } else {
    gh(['release', 'upload', tag, join(directory, record.file), join(directory, 'record.json'), join(directory, 'release-notes.txt'), '--clobber'])
  }
} else {
  // 标签已经核对并存在，不再发送 target_commitish，避免无关工作流变更导致旧提交权限检查失败。
  gh(['release', 'create', tag, join(directory, record.file), join(directory, 'record.json'), join(directory, 'release-notes.txt'), '--verify-tag', '--title', `好日将至 ${platform} v${record.version}`, '--notes-file', join(directory, 'release-notes.txt'), '--draft', '--latest=false'])
}
if (!existing || existing.isDraft) {
  gh(['release', 'edit', tag, '--draft=false', '--latest=false'])
  console.log(`已发布 ${tag}`)
}
