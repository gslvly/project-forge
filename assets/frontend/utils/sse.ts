/**
 * SSE 流式请求（基于 fetch + ReadableStream，无第三方依赖）
 *
 * `http` / `silentHttp` 不适用于流式接口：它们按 `code === 0` 拆包，
 * 且默认 15s 整轮超时，长回答必然被切断。`EventSource` 也用不了，
 * 它只支持 GET，且带不了 `Authorization` 头。
 *
 * 解析只覆盖本项目后端产出的格式（见 backend/app/services/chat.py 的 `_sse`）：
 * 帧之间以空行分隔，帧内只有 `event` 与 `data` 两个字段，data 为单行，换行一律 `\n`。
 * 后端空闲时会插 `: ping` 注释帧，它没有 data，解析后直接被丢弃，只用来重置空闲超时。
 * 将来若要直连第三方 SSE（多行 data、`\r\n` 换行），
 * 得换成完整的规范解析器（如 eventsource-parser），不要在这里打补丁。
 */

import { getToken } from '@/utils/auth'
import { API_BASE_URL, RequestError, handleUnauthorized } from '@/utils/request'
import {
  REQUEST_ID_HEADER,
  finishRequestTrace,
  startRequestTrace,
  type RequestOutcome
} from '@/utils/request-trace'

/** 后端出错时返回的仍是统一响应体 */
interface ApiErrorPayload {
  code: number
  message: string
}

export interface SseEvent {
  /** `event:` 字段；后端未给时为空串 */
  event: string
  /** `data:` 字段原文，JSON 解析由调用方按事件名决定 */
  data: string
}

export interface SseOptions {
  /** 请求体，对象自动 JSON 序列化 */
  body?: unknown
  /** 默认 POST */
  method?: string
  /**
   * 多久收不到任何数据判定超时（毫秒），每收到一段数据就重置。
   * 不是整轮时长：模型边想边吐字，只要还在流就不会触发。
   * 作用是兜住半开连接（对端已挂但 FIN 没到），否则请求会永远挂着。
   * 传 0 表示完全不设超时。
   */
  timeout?: number
  /** 主动取消；取消后迭代静默结束，已产出的事件不受影响 */
  signal?: AbortSignal
}

const DEFAULT_TIMEOUT = 60000

/** 解析单帧，形如 `event: RunContent\ndata: {...}`；没有 data 的帧（心跳等）返回 null */
function parseFrame(frame: string): SseEvent | null {
  let event = ''
  let data = ''

  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data = line.slice(5).trim()
  }

  return data ? { event, data } : null
}

/** 首字节之前失败时，后端返回的是标准 JSON，转成与 http 一致的 RequestError */
async function toRequestError(response: Response, requestId: string) {
  let payload: ApiErrorPayload
  try {
    payload = await response.json()
  } catch {
    return new RequestError(
      `响应解析失败（HTTP ${response.status}）`,
      -1,
      response.status,
      null,
      requestId
    )
  }

  handleUnauthorized(payload.code)
  return new RequestError(
    payload.message || `请求失败（HTTP ${response.status}）`,
    payload.code,
    response.status,
    null,
    requestId
  )
}

/**
 * 发起流式请求，逐个产出 SSE 事件。
 *
 * ```ts
 * const controller = new AbortController()
 * for await (const { event, data } of sseStream('/chat/runs', {
 *   body: { message: '你好' },
 *   signal: controller.signal
 * })) {
 *   if (event === 'RunContent') text += JSON.parse(data).content ?? ''
 * }
 * ```
 *
 * 出错抛 `RequestError`；调用方主动 abort 时不抛，迭代正常结束。
 */
export async function* sseStream(url: string, options: SseOptions = {}): AsyncGenerator<SseEvent> {
  const { body, method = 'POST', timeout = DEFAULT_TIMEOUT, signal } = options

  const controller = new AbortController()
  let timedOut = false
  let timer = 0
  const trace = startRequestTrace(method, url)

  const resetTimeout = () => {
    clearTimeout(timer)
    if (!timeout) return
    timer = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeout)
  }

  const headers = new Headers({ Accept: 'text/event-stream' })
  headers.set(REQUEST_ID_HEADER, trace.requestId)
  if (body !== undefined) headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  resetTimeout()
  try {
    response = await fetch(`${API_BASE_URL}${url}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
    })
  } catch {
    clearTimeout(timer)
    if (signal?.aborted) {
      finishRequestTrace(trace, { outcome: 'cancelled' })
      return
    }
    finishRequestTrace(trace, { outcome: timedOut ? 'timeout' : 'network_error' })
    throw new RequestError(
      timedOut ? '请求超时' : '网络异常，请检查连接',
      -1,
      0,
      null,
      trace.requestId
    )
  }

  if (!response.ok || !response.body) {
    clearTimeout(timer)
    const error = await toRequestError(response, trace.requestId)
    finishRequestTrace(trace, {
      outcome: 'error',
      statusCode: response.status,
      errorCode: error.code
    })
    throw error
  }

  // 用 getReader 而不是 for await：ReadableStream 的异步迭代要 Chrome 124+ 才支持
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let outcome: RequestOutcome = 'success'
  let completed = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        completed = true
        break
      }

      resetTimeout()
      buffer += value

      // 一次 read 可能拿到半帧，也可能拿到好几帧，按空行切到切不动为止
      let index = buffer.indexOf('\n\n')
      while (index !== -1) {
        const event = parseFrame(buffer.slice(0, index))
        buffer = buffer.slice(index + 2)
        if (event) yield event
        index = buffer.indexOf('\n\n')
      }
    }
  } catch {
    if (signal?.aborted) {
      outcome = 'cancelled'
      return
    }
    outcome = timedOut ? 'timeout' : 'network_error'
    throw new RequestError(
      timedOut ? '连接超时' : '连接中断',
      -1,
      response.status,
      null,
      trace.requestId
    )
  } finally {
    clearTimeout(timer)
    if (!completed && outcome === 'success') outcome = 'cancelled'
    finishRequestTrace(trace, { outcome, statusCode: response.status })
    // 调用方 break 提前退出时，底层连接也要关掉
    await reader.cancel().catch(() => {})
  }
}
