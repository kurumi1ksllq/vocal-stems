/**
 * electron-log 只允许在主进程 import（spec 纪律）。
 *
 * preload 不 import 它 —— 渲染进程的错误经 IPC 到这里，
 * 由主进程统一落库 + 写文件。
 */

import type { RendererErrorPayload } from '@vs/shared/ipc'
import log from 'electron-log/main'

export function initLogger(level: string): void {
  log.initialize()
  log.transports.file.level = level as 'info'
  log.transports.console.level = level as 'info'
  log.transports.file.maxSize = 8 * 1024 * 1024
  log.errorHandler.startCatching({ showDialog: false })
}

export function mainLog() {
  return log
}

/** 渲染进程错误：写 electron-log，同时返回时间戳供调用方落库。 */
export function logRendererError(payload: RendererErrorPayload): number {
  const at = Date.now()
  log.error('[renderer]', payload.message)
  if (payload.stack) log.error(payload.stack)
  if (payload.componentStack) log.error('componentStack:', payload.componentStack)
  if (payload.url) log.error('url:', payload.url)
  return at
}
