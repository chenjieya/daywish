import { copyFile, mkdir, writeFile, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
await mkdir('website/public', { recursive: true })
await copyFile('public/icon.png', 'website/public/icon.png')
const { version } = JSON.parse(await readFile('package.json', 'utf8'))
let commit = 'working-tree'
try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch {}
await writeFile('website/public/build.json', JSON.stringify({ version, commit, builtAt: new Date().toISOString() }, null, 2) + '\n')
