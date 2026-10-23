/**
 * 统一请求封装（基于原生 fetch，无第三方依赖）
 *
 * 后端约定响应体为 { code, message, data }，code === 0 视为成功。
 * 成功时直接 resolve `data`，失败时 reject 一个 RequestError。
 *
 * 对外只给实例：默认用 `http`，需要自己接管错误提示时用 `silentHttp`。
 */

import router from '@/router'
import { clearAuth, getToken } from '@/utils/auth'
import {
  REQUEST_ID_HEADER,
  finishRequestTrace,
  startRequestTrace,
  type ActiveRequestTrace
} from '@/utils/request-trace'

/** 后端统一响应结构 */
interface ApiResponse<T> {
  code: number
  message: string
  data: T | null
}

export class RequestError extends Error {
  /** 业务错误码；网络异常、解析失败等为 -1 */
  code: number
  /** HTTP 状态码；请求未发出（超时、断网）时为 0 */
  status: number
  /** 少数错误会带结构化明细（如导入失败的逐行定位），调用方自行判断类型；其余为 null */
  data: unknown
  /** 可直接交给 AI 查询容器日志的链路 ID */
  requestId: string

  constructor(
    message: string,
    code = -1,
    status = 0,
    data: unknown = null,
    requestId = ''
  ) {
    super(message)
    this.name = 'RequestError'
    this.code = code
    this.status = status
    this.data = data
    this.requestId = requestId
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** query 参数，自动拼到 url 上，值为 undefined / null 的键会被跳过 */
  params?: Record<string, unknown>
  /** 请求体，普通对象自动 JSON 序列化；FormData 原样发送 */
  body?: unknown
  /** 超时毫秒数，默认 15000；传 0 表示不设超时 */
  timeout?: number
}

/** 文件下载响应，保留服务端提供的文件名供调用方保存 */
export interface DownloadResult {
  blob: Blob
  filename: string
}

/** 接口前缀，流式请求（utils/sse.ts）要复用同一个来源 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'
const DEFAULT_TIMEOUT = 15000
const SUCCESS_CODE = 0
/** 登录已过期，需要清掉本地登录态并回登录页 */
const UNAUTHORIZED_CODE = 1401

/** createHttp 的实例级配置 */
export interface HttpConfig {
  /** 为 true 时错误不走全局提示，只 reject，由调用方自行处理 */
  silent?: boolean
}

type ErrorHandler = (error: RequestError) => void

let errorHandler: ErrorHandler = (error) => {
  console.error(`[request] ${error.message}`)
}

/**
 * 注册全局错误处理，在 main.ts 里接 UI 提示即可，例如：
 * setRequestErrorHandler((err) => ElMessage.error(err.message))
 */
export function setRequestErrorHandler(handler: ErrorHandler) {
  errorHandler = handler
}

/** 造一个错误，非 silent 实例顺带走全局提示，调用方直接 throw 返回值 */
function fail(
  silent: boolean,
  message: string,
  code = -1,
  status = 0,
  data: unknown = null,
  requestId = ''
) {
  const error = new RequestError(message, code, status, data, requestId)
  if (!silent) errorHandler(error)
  return error
}

function buildQuery(params?: Record<string, unknown>) {
  if (!params) return ''

  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    search.append(key, String(value))
  })

  const query = search.toString()
  return query ? `?${query}` : ''
}

/** 注入 Content-Type 与 Authorization，调用方已显式给的不覆盖 */
function buildHeaders(headers: HeadersInit | undefined, body: unknown, requestId: string) {
  const finalHeaders = new Headers(headers)

  // FormData 交给浏览器自己带 boundary，不能手动设 Content-Type
  if (body !== undefined && !(body instanceof FormData) && !finalHeaders.has('Content-Type')) {
    finalHeaders.set('Content-Type', 'application/json')
  }

  const token = getToken()
  if (token && !finalHeaders.has('Authorization')) {
    finalHeaders.set('Authorization', `Bearer ${token}`)
  }
  finalHeaders.set(REQUEST_ID_HEADER, requestId)

  return finalHeaders
}

/** 统一执行 fetch，下载和 JSON API 共享登录态、超时与网络错误处理 */
async function fetchResponse(
  url: string,
  options: RequestOptions,
  { silent = false }: HttpConfig
) {
  const { params, body, timeout = DEFAULT_TIMEOUT, headers, signal, ...rest } = options
  const isFormData = body instanceof FormData
  const incomingRequestId = new Headers(headers).get(REQUEST_ID_HEADER)
  const trace = startRequestTrace(String(rest.method || 'GET'), url, incomingRequestId)
  const finalHeaders = buildHeaders(headers, body, trace.requestId)
  const hasTimeout = timeout > 0
  const timeoutSignal = hasTimeout ? AbortSignal.timeout(timeout) : undefined

  try {
    const response = await fetch(`${API_BASE_URL}${url}${buildQuery(params)}`, {
      ...rest,
      headers: finalHeaders,
      signal:
        signal && timeoutSignal
          ? AbortSignal.any([signal, timeoutSignal])
          : (signal ?? timeoutSignal),
      body: body === undefined || isFormData ? (body as BodyInit | undefined) : JSON.stringify(body)
    })
    return { response, trace }
  } catch {
    // 调用方主动取消：静默抛出，不弹提示
    if (signal?.aborted) {
      finishRequestTrace(trace, { outcome: 'cancelled' })
      throw new RequestError('请求已取消', -1, 0, null, trace.requestId)
    }
    const timedOut = timeoutSignal?.aborted === true
    finishRequestTrace(trace, { outcome: timedOut ? 'timeout' : 'network_error' })
    throw fail(
      silent,
      timedOut ? '请求超时' : '网络异常，请检查连接',
      -1,
      0,
      null,
      trace.requestId
    )
  }
}

/** 登录过期的统一处理，流式请求（utils/sse.ts）拿到 1401 时也要走这里 */
export function handleUnauthorized(code: number) {
  if (code !== UNAUTHORIZED_CODE) return
  clearAuth()
  if (router.currentRoute.value.path !== '/login') router.replace('/login')
}

/** 文件下载接口失败时仍返回标准 JSON，需要继续走统一业务错误处理 */
async function throwDownloadError(
  response: Response,
  silent: boolean,
  trace: ActiveRequestTrace
): Promise<never> {
  try {
    const payload = (await response.json()) as ApiResponse<unknown>
    handleUnauthorized(payload.code)
    finishRequestTrace(trace, {
      outcome: 'error',
      statusCode: response.status,
      errorCode: payload.code
    })
    throw fail(
      silent,
      payload.message || `请求失败（HTTP ${response.status}）`,
      payload.code,
      response.status,
      null,
      trace.requestId
    )
  } catch (error) {
    if (error instanceof RequestError) throw error
    finishRequestTrace(trace, { outcome: 'error', statusCode: response.status, errorCode: -1 })
    throw fail(
      silent,
      `响应解析失败（HTTP ${response.status}）`,
      -1,
      response.status,
      null,
      trace.requestId
    )
  }
}

function getDownloadFilename(response: Response) {
  const disposition = response.headers.get('Content-Disposition') || ''
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  const plainMatch = disposition.match(/filename="?([^";]+)"?/i)
  const encodedName = utf8Match?.[1] || plainMatch?.[1]

  if (!encodedName) return 'download'
  try {
    return decodeURIComponent(encodedName)
  } catch {
    return encodedName
  }
}

async function request<T>(
  url: string,
  options: RequestOptions = {},
  { silent = false }: HttpConfig = {}
): Promise<T> {
  const { response, trace } = await fetchResponse(url, options, { silent })

  // 204 / 205 无响应体
  if (response.status === 204 || response.status === 205) {
    finishRequestTrace(trace, { outcome: 'success', statusCode: response.status })
    return null as T
  }

  let payload: ApiResponse<T>
  try {
    payload = await response.json()
  } catch {
    finishRequestTrace(trace, { outcome: 'error', statusCode: response.status, errorCode: -1 })
    throw fail(
      silent,
      `响应解析失败（HTTP ${response.status}）`,
      -1,
      response.status,
      null,
      trace.requestId
    )
  }

  if (payload.code !== SUCCESS_CODE) {
    handleUnauthorized(payload.code)
    finishRequestTrace(trace, {
      outcome: 'error',
      statusCode: response.status,
      errorCode: payload.code
    })
    throw fail(
      silent,
      payload.message || `请求失败（HTTP ${response.status}）`,
      payload.code,
      response.status,
      payload.data,
      trace.requestId
    )
  }

  finishRequestTrace(trace, { outcome: 'success', statusCode: response.status })
  return payload.data as T
}

async function downloadRequest(
  url: string,
  options: RequestOptions = {},
  { silent = false }: HttpConfig = {}
): Promise<DownloadResult> {
  const { response, trace } = await fetchResponse(url, options, { silent })
  const contentType = response.headers.get('Content-Type') || ''

  // 下载端点成功时是二进制；任何 JSON 都按统一响应错误处理，避免把错误页存成 xlsx。
  if (!response.ok || contentType.includes('json')) {
    return throwDownloadError(response, silent, trace)
  }

  const blob = await response.blob()
  finishRequestTrace(trace, { outcome: 'success', statusCode: response.status })
  return {
    blob,
    filename: getDownloadFilename(response)
  }
}

/** 使用浏览器原生下载能力保存统一下载响应 */
export function saveDownload({ blob, filename }: DownloadResult) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/** 按配置造一个请求实例，各方法签名与 http 一致 */
export function createHttp(config: HttpConfig = {}) {
  return {
    get: <T>(url: string, params?: Record<string, unknown>, options?: RequestOptions) =>
      request<T>(url, { ...options, method: 'GET', params }, config),

    post: <T>(url: string, body?: unknown, options?: RequestOptions) =>
      request<T>(url, { ...options, method: 'POST', body }, config),

    put: <T>(url: string, body?: unknown, options?: RequestOptions) =>
      request<T>(url, { ...options, method: 'PUT', body }, config),

    patch: <T>(url: string, body?: unknown, options?: RequestOptions) =>
      request<T>(url, { ...options, method: 'PATCH', body }, config),

    delete: <T>(url: string, params?: Record<string, unknown>, options?: RequestOptions) =>
      request<T>(url, { ...options, method: 'DELETE', params }, config),

    download: (url: string, options?: RequestOptions) => downloadRequest(url, options, config)
  }
}

/** 默认实例：错误自动走全局提示 */
export const http = createHttp()

/** 静默实例：错误只 reject 不提示，调用方必须自己 catch 处理 */
export const silentHttp = createHttp({ silent: true })
