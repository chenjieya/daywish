import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const [tag, directory = 'publication'] = process.argv.slice(2)
if (!tag || tag.startsWith('-')) throw new Error('缺少有效 Release 标签')
const gh = args => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const release = JSON.parse(gh(['release', 'view', tag, '--json', 'assets,publishedAt,body,isDraft,isPrerelease']))
if (release.isDraft || release.isPrerelease) throw new Error('官网只同步正式发布版本')
await mkdir(directory, { recursive: true })
const assets = release.assets.filter(a => /^Daywish-\d+\.\d+\.\d+-(Windows-x64-Setup\.exe|macOS-(arm64|x86_64)\.zip)$/.test(a.name))
if (!assets.length) throw new Error('没有符合约定的 Windows 或 Mac 安装包')
for (const suffix of ['-Windows-', '-macOS-']) {
  if (assets.filter(a => a.name.includes(suffix)).length > 1) throw new Error('当前官网每个平台接受一个安装包，请为 Mac 明确选择 Apple Silicon 或 Intel 构建')
}
let existing
if (release.assets.some(a => a.name === 'record.json')) {
  gh(['release', 'download', tag, '--pattern', 'record.json', '--dir', directory, '--clobber'])
  existing = JSON.parse(await readFile(join(directory, 'record.json'), 'utf8'))
}
for (const asset of assets) {
  const file = join(directory, asset.name)
  gh(['release', 'download', tag, '--pattern', asset.name, '--dir', directory, '--clobber'])
  const platform = asset.name.includes('-Windows-') ? 'windows' : 'macos'
  const version = /^Daywish-(\d+\.\d+\.\d+)-/.exec(asset.name)[1]
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(file)) digest.update(chunk)
  const sha256 = digest.digest('hex'), bytes = (await stat(file)).size
  if (bytes !== asset.size) throw new Error('下载文件大小与 GitHub 元数据不符')
  let record
  if (existing?.file === asset.name) {
    if (existing.sha256 !== sha256 || existing.bytes !== bytes || existing.version !== version || existing.platform !== platform) throw new Error('GitHub 版本记录与实际安装包不符')
    record = existing
  } else {
    record = { platform, version, file: asset.name, bytes, sha256, publishedAt: release.publishedAt, notes: release.body.split(/\r?\n/).map(s => s.replace(/^[-*#\s]+/, '').trim()).filter(Boolean) }
    if (!record.notes.length) record.notes = [`发布 ${platform} v${version}`]
  }
  await writeFile(join(directory, `${platform}-${version}.record.json`), JSON.stringify(record, null, 2) + '\n')
}
console.log(`已验证 ${assets.length} 个安装包，准备同步官网`)
