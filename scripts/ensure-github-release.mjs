import { execFileSync } from 'node:child_process'
import { readFileSync, mkdirSync } from 'node:fs'
import assert from 'node:assert/strict'

const tag = process.argv[2]
assert(/^(windows|macos)-v\d+\.\d+\.\d+$/.test(tag || ''), '无效正式版本标签')
const repo = process.env.GITHUB_REPOSITORY
assert.equal(repo, 'chenjieya/daywish')
const gh = args => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
let release
try { release = JSON.parse(gh(['release', 'view', tag, '--json', 'isDraft'])) } catch (error) {
  if (!String(error.stderr).includes('release not found')) throw error
}
if (!release || release.isDraft) {
  const runs = JSON.parse(gh(['run', 'list', '--workflow', 'release.yml', '--branch', tag, '--limit', '10', '--json', 'databaseId,headSha']))
  let source
  for (const run of runs) {
    const context = JSON.parse(gh(['api', `repos/${repo}/actions/runs/${run.databaseId}`]))
    if (context.path !== '.github/workflows/release.yml' || context.head_repository.full_name !== repo) continue
    const { jobs } = JSON.parse(gh(['api', `repos/${repo}/actions/runs/${run.databaseId}/jobs`]))
    if (jobs.some(job => job.name === 'package' && job.conclusion === 'success')) { source = run; break }
  }
  assert(source, '没有通过测试与打包的原始产物，请先运行客户端发布工作流')
  const directory = 'recovered-publication'
  mkdirSync(directory, { recursive: true })
  gh(['run', 'download', String(source.databaseId), '--name', 'daywish-publication', '--dir', directory])
  const record = JSON.parse(readFileSync(`${directory}/record.json`, 'utf8'))
  assert.equal(`${record.platform}-v${record.version}`, tag, '原产物与恢复标签不一致')
  execFileSync(process.execPath, ['scripts/publish-github.mjs', directory], { stdio: 'inherit', env: { ...process.env, GITHUB_SHA: source.headSha, PLATFORM: record.platform } })
  console.log(`::notice title=已复用原始构建发布::${tag} 来自已验证 Run ${source.databaseId}，未重新打包或移动标签`)
}
