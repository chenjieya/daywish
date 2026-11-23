import { copyFile, mkdir, readFile } from 'node:fs/promises'
const check = process.argv.includes('--check')
for (const name of ['calendar.json', 'springs.json', 'date-cases.json']) {
  const target = `macos/Sources/DaywishCore/Resources/${name}`
  if (check) {
    const [source, copy] = await Promise.all([readFile(`shared/${name}`), readFile(target)])
    if (!source.equals(copy)) throw new Error(`Mac 日历副本过期：${name}，请运行 node scripts/sync-mac-data.mjs`)
  } else {
    await mkdir('macos/Sources/DaywishCore/Resources', { recursive: true })
    await copyFile(`shared/${name}`, target)
  }
}
console.log(check ? 'Mac 资源与共享数据一致' : 'Mac 资源已同步')
