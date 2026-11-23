import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { getCalendarUpdate } from './server/calendar-service'
import { fetchText } from './server/fetch-text'

export default defineConfig({
  plugins: [vue(), {
    name: 'daywish-calendar-preview',
    configureServer(server) {
      server.middlewares.use('/api/calendar-update', async (request, response) => {
        const year = Number(new URL(request.url ?? '/', 'http://localhost').searchParams.get('year'))
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        if (request.method !== 'GET' || !Number.isInteger(year) || year < 2020 || year > 2100) {
          response.statusCode = 400; response.end(JSON.stringify({ error: '年份不合法' })); return
        }
        try { response.end(JSON.stringify(await getCalendarUpdate(year, fetchText))) }
        catch { response.statusCode = 503; response.end(JSON.stringify({ error: '暂时无法连接官方数据源，继续使用本地日历' })) }
      })
    },
  }], base: './', server: { host: '127.0.0.1' },
})
