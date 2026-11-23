import { createReadStream } from 'node:fs'
import { stat, readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { createHash } from 'node:crypto'
const [platform, file, output, notesFile] = process.argv.slice(2)
if (!['windows', 'macos'].includes(platform) || !file || !output || !notesFile) throw new Error('用法：platform 安装包 输出JSON 更新说明TXT')
const { version } = JSON.parse(await readFile('package.json', 'utf8'))
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('版本号必须为三段数字')
const name = basename(file)
if (!new RegExp(`^Daywish-${version.replaceAll('.', '\\.')}-[A-Za-z0-9.-]+\\.${platform === 'windows' ? 'exe' : 'zip'}$`).test(name)) throw new Error('安装包名称与平台或版本不匹配')
const hash = createHash('sha256')
for await (const chunk of createReadStream(file)) hash.update(chunk)
const info = await stat(file)
const notes = (await readFile(notesFile, 'utf8')).split(/\r?\n/).map(s => s.trim()).filter(Boolean)
if (!notes.length) throw new Error('更新说明不能为空')
const record = { platform, version, file: name, bytes: info.size, sha256: hash.digest('hex'), publishedAt: new Date().toISOString(), notes }
await writeFile(output, JSON.stringify(record, null, 2) + '\n')
console.log(`已核对安装包 ${name}，SHA-256: ${record.sha256}`)
