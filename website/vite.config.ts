import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { resolve, basename } from 'node:path'
import { createReadStream, existsSync, statSync } from 'node:fs'

const root = fileURLToPath(new URL('.', import.meta.url))
export default defineConfig({
  root, plugins: [vue(), {
    name: 'daywish-local-download-review',
    configureServer(server) {
      // 本地审核复用已生成的安装包，生产安装包由独立下载目录提供。
      server.middlewares.use('/downloads', (request, response, next) => {
        const name = new URL(request.url ?? '/', 'http://localhost').pathname.slice(1)
        if (name !== basename(name) || !/^Daywish-[\w.-]+\.(exe|zip)$/.test(name)) return next()
        const file = resolve(root, '../release', name)
        if (!existsSync(file)) return next()
        if (request.method !== 'GET' && request.method !== 'HEAD') { response.statusCode = 405; response.end(); return }
        response.setHeader('Content-Type', 'application/octet-stream')
        response.setHeader('Content-Length', statSync(file).size)
        response.setHeader('Content-Disposition', `attachment; filename="${name}"`)
        if (request.method === 'HEAD') { response.end(); return }
        const stream = createReadStream(file)
        stream.on('error', () => { response.statusCode = 500; response.end() })
        response.on('close', () => stream.destroy())
        stream.pipe(response)
      })
    },
  }],
  publicDir: 'public',
  build: { outDir: resolve(root, '../website-dist'), emptyOutDir: true },
  server: { host: '127.0.0.1', port: 5175 },
})
