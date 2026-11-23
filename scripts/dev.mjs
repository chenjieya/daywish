import { createServer } from 'vite'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, copyFile } from 'node:fs/promises'
const require = createRequire(import.meta.url)
const tsc = spawn(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.desktop.json'], { stdio: 'inherit' })
if (await new Promise(resolve => tsc.once('exit', resolve)) !== 0) process.exit(1)
await mkdir('dist', { recursive: true })
await copyFile('public/icon.png', 'dist/icon.png')
const server = await createServer()
await server.listen()
server.printUrls()
const url = server.resolvedUrls.local[0]
const environment = { ...process.env, DAYWISH_DEV_URL: url }
delete environment.ELECTRON_RUN_AS_NODE
const child = spawn(require('electron'), ['.'], { stdio: 'inherit', env: environment })
child.once('exit', async code => { await server.close(); process.exit(code ?? 0) })
process.once('SIGINT', () => child.kill())
