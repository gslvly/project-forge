/** 浏览器内短期请求轨迹：只保存定位元数据，不保存 query、请求体或响应体。 */

export const REQUEST_ID_HEADER = 'X-Request-ID'

const MAX_RECENT_TRACES = 50
const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/

export type RequestOutcome =
  | 'success'
  | 'error'
  | 'cancelled'
  | 'timeout'
  | 'network_error'

export interface RequestTrace {
  requestId: string
  method: string
  path: string
  startedAt: string
  durationMs: number
  statusCode: number
  errorCode: number | null
  outcome: RequestOutcome
}

export interface ActiveRequestTrace {
  requestId: string
  method: string
  path: string
  startedAt: string
  startedMs: number
  finished: boolean
}

const recentTraces: RequestTrace[] = []

export function createRequestId(candidate?: string | null) {
  if (candidate && VALID_REQUEST_ID.test(candidate)) return candidate
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return uuid

  // randomUUID 只在安全上下文可用；当前部署仍可能通过普通 HTTP 访问公网 IP。
  const bytes = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.random() * 256
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

export function startRequestTrace(
  method: string,
  path: string,
  candidateRequestId?: string | null
): ActiveRequestTrace {
  return {
    requestId: createRequestId(candidateRequestId),
    method: method.toUpperCase(),
    path: path.split('?', 1)[0]?.slice(0, 300) || '/',
    startedAt: new Date().toISOString(),
    startedMs: performance.now(),
    finished: false
  }
}

export function finishRequestTrace(
  active: ActiveRequestTrace,
  result: {
    outcome: RequestOutcome
    statusCode?: number
    errorCode?: number | null
  }
) {
  if (active.finished) return
  active.finished = true
  recentTraces.push({
    requestId: active.requestId,
    method: active.method,
    path: active.path,
    startedAt: active.startedAt,
    durationMs: Math.round((performance.now() - active.startedMs) * 10) / 10,
    statusCode: result.statusCode ?? 0,
    errorCode: result.errorCode ?? null,
    outcome: result.outcome
  })
  if (recentTraces.length > MAX_RECENT_TRACES) {
    recentTraces.splice(0, recentTraces.length - MAX_RECENT_TRACES)
  }
}

/** 供 AI Bridge 在页面仍打开时读取；返回副本，避免业务代码改坏缓冲区。 */
export function getRecentRequestTraces(): RequestTrace[] {
  return recentTraces.map((item) => ({ ...item }))
}
