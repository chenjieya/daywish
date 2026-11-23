import { createReadStream } from 'node:fs'
import { stat, readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { createHash, createPublicKey, verify } from 'node:crypto'
const [platform, file, output, notesFile] = process.argv.slice(2)
if (!['windows', 'macos'].includes(platform) || !file || !output || !notesFile) throw new Error('用法：platform 安装包 输出JSON 更新说明TXT')
const { version } = JSON.parse(await readFile('package.json', 'utf8'))
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('版本号必须为三段数字')
const name = basename(file)
if (!new RegExp(`^Daywish-${version.replaceAll('.', '\\.')}-[A-Za-z0-9.-]+\\.${platform === 'windows' ? 'exe' : 'zip'}$`).test(name)) throw new Error('安装包名称与平台或版本不匹配')
const hash = createHash('sha256')
const sha512 = createHash('sha512')
for await (const chunk of createReadStream(file)) { hash.update(chunk); sha512.update(chunk) }
const info = await stat(file)
const notes = (await readFile(notesFile, 'utf8')).split(/\r?\n/).map(s => s.trim()).filter(Boolean)
if (!notes.length) throw new Error('更新说明不能为空')
const record = { platform, version, file: name, bytes: info.size, sha256: hash.digest('hex'), sha512: sha512.digest('base64'), publishedAt: new Date().toISOString(), notes }
if (platform === 'macos') {
  const signed = JSON.parse(await readFile(`${file}.signature.json`, 'utf8'))
  if (signed.sha256 !== record.sha256 || signed.publicKey !== process.env.DAYWISH_UPDATE_PUBLIC_KEY) throw new Error('Mac 签名公钥或包校验值不符')
  const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(signed.publicKey, 'base64')]), format: 'der', type: 'spki' })
  if (!verify(null, await readFile(file), key, Buffer.from(signed.edSignature, 'base64'))) throw new Error('Mac 更新签名无法验证')
  record.edSignature = signed.edSignature
  record.publicKey = signed.publicKey
}
await writeFile(output, JSON.stringify(record, null, 2) + '\n')
console.log(`已核对安装包 ${name}，SHA-256: ${record.sha256}`)
