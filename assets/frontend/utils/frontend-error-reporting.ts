import type { App } from 'vue'

import { RequestError, silentHttp } from '@/utils/request'

declare global {
  interface Window {
    appVersion?: string
  }
}

type ErrorSource = 'window_error' | 'unhandled_rejection' | 'vue_error'

const MAX_REPORTS_PER_MINUTE = 5
const DEDUPE_MS = 30_000
const reports: number[] = []
const fingerprints = new Map<string, number>()
const urlQuery = /(https?:\/\/[^\s?#]+)(?:\?[^#\s]*)?(?:#[^\s]*)?/g
const secret = /\b(authorization|cookie|password|token|secret)\b\s*[:=]\s*[^\s,;]+/gi

function sanitize(value: string, limit: number) {
  return value
    .replaceAll('\0', '')
    .replace(urlQuery, '$1')
    .replace(secret, '$1=[REDACTED]')
    .slice(0, limit)
}

function errorMetadata(error: unknown) {
  if (error instanceof Error) {
    return {
      errorType: error.name || 'Error',
      message: error.message || 'Unknown error',
      stack: error.stack || '',
      relatedRequestId: error instanceof RequestError ? error.requestId : undefined
    }
  }
  return {
    errorType: typeof error,
    message: 'Non-Error rejection',
    stack: '',
    relatedRequestId: undefined
  }
}

function shouldReport(fingerprint: string) {
  const now = Date.now()
  while (reports[0] && reports[0] <= now - 60_000) reports.shift()
  if (reports.length >= MAX_REPORTS_PER_MINUTE) return false
  const previous = fingerprints.get(fingerprint) || 0
  if (previous > now - DEDUPE_MS) return false
  reports.push(now)
  fingerprints.set(fingerprint, now)
  return true
}

async function reportError(source: ErrorSource, error: unknown, route: string) {
  const metadata = errorMetadata(error)
  const errorType = sanitize(metadata.errorType, 100)
  const message = sanitize(metadata.message, 500)
  const stack = sanitize(metadata.stack, 6000)
  const fingerprint = `${source}|${errorType}|${message}|${stack.split('\n', 1)[0]}`
  if (!shouldReport(fingerprint)) return

  try {
    await silentHttp.post<void>('/diagnostics/frontend-errors', {
      source,
      error_type: errorType,
      message,
      stack,
      route: sanitize(route.split('?', 1)[0] || '/', 300),
      frontend_release: sanitize(window.appVersion || 'unknown', 200),
      related_request_id: metadata.relatedRequestId || null
    })
  } catch {
    // 诊断上报不能反过来干扰业务，也不能递归制造新的未处理异常。
  }
}

export function installFrontendErrorReporting(app: App, getRoute: () => string) {
  window.addEventListener('error', (event) => {
    void reportError('window_error', event.error || new Error(event.message), getRoute())
  })
  window.addEventListener('unhandledrejection', (event) => {
    void reportError('unhandled_rejection', event.reason, getRoute())
  })
  app.config.errorHandler = (error) => {
    void reportError('vue_error', error, getRoute())
  }
}
