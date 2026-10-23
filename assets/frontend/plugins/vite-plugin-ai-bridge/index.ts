import { writeFileSync } from 'fs'
import { resolve } from 'path'
import type { Plugin, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'http'

/**
 * 让终端在 dev 页面里求值，供 AI 读取应用运行时状态。
 *   curl -s -X POST localhost:$(cat node_modules/.ai-bridge-port)/__ai/exec --data 'document.title'
 * 走 HMR 的 WebSocket 下发，页面应答后原路返回，只在 dev 生效（apply: 'serve'）。
 */

const VIRTUAL_ID = 'virtual:ai-bridge'
const RESOLVED_ID = '\0' + VIRTUAL_ID
const TIMEOUT = 10000
// 把 Vite 实际监听端口落盘，供终端发现 bridge
const PORT_FILE = resolve(process.cwd(), 'node_modules/.ai-bridge-port')

// 注入页面的客户端。不 import 任何项目模块、不往 window 挂东西、不 patch 全局。
const CLIENT = `
if (import.meta.hot) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

  const serialize = (val) => {
    const seen = new WeakSet()
    return JSON.parse(
      JSON.stringify(val ?? null, (key, v) => {
        if (typeof v === 'function') return '[Function]'
        if (v instanceof Error) return v.name + ': ' + v.message
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) return '[Circular]'
          seen.add(v)
        }
        return v
      })
    )
  }

  import.meta.hot.on('ai-bridge:exec', async ({ id, code }) => {
    // 多个标签页都会收到，可见的先答，不可见的让位兜底
    if (document.visibilityState !== 'visible') {
      await new Promise((r) => setTimeout(r, 60))
    }
    let out
    try {
      // 先当表达式，语法不通过再当语句块，行为对齐 devtools 控制台
      let fn
      try {
        fn = new AsyncFunction('return (' + code + ')')
      } catch {
        fn = new AsyncFunction(code)
      }
      out = { ok: serialize(await fn()) }
    } catch (e) {
      out = { err: String(e) }
    }
    import.meta.hot.send('ai-bridge:result', { id, url: location.href, ...out })
  })
}
`

const reply = (res: ServerResponse, body: unknown) => {
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body, null, 2))
}

const readBody = (req: IncomingMessage) =>
  new Promise<string>((ok) => {
    let s = ''
    req.on('data', (c) => (s += c))
    req.on('end', () => ok(s))
  })

export const aiBridge = (): Plugin => {
  const pending = new Map<string, ServerResponse>()
  let seq = 0

  return {
    name: 'ai-bridge',
    apply: 'serve',

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },

    load(id) {
      if (id === RESOLVED_ID) return CLIENT
    },

    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'module', src: `/@id/__x00__${VIRTUAL_ID}` },
          injectTo: 'body' as const
        }
      ]
    },

    configureServer(server: ViteDevServer) {
      server.httpServer?.once('listening', () => {
        const addr = server.httpServer?.address()
        if (addr && typeof addr === 'object') {
          try {
            writeFileSync(PORT_FILE, String(addr.port))
          } catch {
            // 落盘失败不影响 dev，终端退化成手填端口
          }
        }
      })

      server.hot.on('ai-bridge:result', (data: { id: string }) => {
        const res = pending.get(data.id)
        if (!res) return // 已被更快的页面应答，或已超时
        pending.delete(data.id)
        reply(res, data)
      })

      server.middlewares.use('/__ai/exec', async (req, res) => {
        if (req.method !== 'POST') {
          return reply(res, { error: '用 POST，body 直接放 JS 表达式' })
        }
        const code = await readBody(req)
        if (!code.trim()) return reply(res, { error: 'body 为空' })

        const id = String(++seq)
        pending.set(id, res)
        setTimeout(() => {
          if (!pending.delete(id)) return
          reply(res, { error: '超时：没有页面应答，dev 页面开着吗？' })
        }, TIMEOUT)

        server.hot.send('ai-bridge:exec', { id, code })
      })
    }
  }
}
