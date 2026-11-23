import http from 'node:http'
import https from 'node:https'
import tls from 'node:tls'
import type { Duplex } from 'node:stream'

/** 开发服务器支持已有 HTTPS_PROXY 设置；保持 TLS 校验，不把代理凭证写入日志。 */
async function proxySocket(target: URL, proxy: URL): Promise<tls.TLSSocket> {
  const tunnel = await new Promise<Duplex>((resolve, reject) => {
    const headers: Record<string, string> = { Host: `${target.hostname}:443` }
    if (proxy.username) headers['Proxy-Authorization'] = `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString('base64')}`
    const request = (proxy.protocol === 'https:' ? https : http).request({ hostname: proxy.hostname, port: proxy.port || (proxy.protocol === 'https:' ? 443 : 80), method: 'CONNECT', path: `${target.hostname}:443`, headers, signal: AbortSignal.timeout(8000) })
    request.once('connect', (response, socket, head) => {
      if (response.statusCode !== 200) { socket.destroy(); reject(new Error('代理连接失败')); return }
      if (head.length) socket.unshift(head)
      resolve(socket)
    })
    request.once('error', reject)
    request.end()
  })
  return new Promise((resolve, reject) => {
    const secure = tls.connect({ socket: tunnel, servername: target.hostname })
    const timeout = setTimeout(() => secure.destroy(new Error('TLS 连接超时')), 8000)
    secure.once('secureConnect', () => { clearTimeout(timeout); resolve(secure) })
    secure.once('error', error => { clearTimeout(timeout); reject(error) })
  })
}
export async function fetchText(address: string): Promise<string> {
  const url = new URL(address)
  if (url.protocol !== 'https:') throw new Error('仅允许 HTTPS 数据源')
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy
  const socket = proxy ? await proxySocket(url, new URL(proxy)) : undefined
  return new Promise((resolve, reject) => {
    const request = https.get(url, { ...(socket ? { createConnection: () => socket } : {}), headers: { 'User-Agent': 'Daywish/0.2 Calendar', Accept: 'text/html,application/json' }, signal: AbortSignal.timeout(12000) }, response => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error(`HTTP ${response.statusCode}`)); return }
      const chunks: Buffer[] = []
      let size = 0
      response.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > 2_000_000) { request.destroy(new Error('日历响应过大')); return }
        chunks.push(chunk)
      })
      response.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      response.once('error', reject)
    })
    request.once('error', reject)
  })
}
