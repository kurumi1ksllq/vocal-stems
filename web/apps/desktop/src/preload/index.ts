/**
 * Preload —— 渲染进程唯一的 Node 边界。
 *
 * 纪律（spec）：
 *   - 只做 IPC 桥接，不 import electron-log、不碰数据库、不碰文件系统
 *   - contextIsolation 开着，全部能力经 contextBridge 显式暴露
 *   - 暴露面尽量小：一个 rpc()、一个 reportError()、两个订阅、一个 env()
 */
import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron'

/** 与 packages/shared/src/ipc.ts 保持一致；这里手写是为了 preload 不依赖 workspace 包 */
const IPC = {
  RPC: 'vs:rpc',
  JOB_LOG: 'vs:job-log',
  JOB_STATE: 'vs:job-state',
  REPORT_ERROR: 'vs:report-error',
  ENV: 'vs:env',
} as const

interface RpcRequest {
  method: 'GET' | 'POST' | 'DELETE'
  path: string
  body?: unknown
}

type RpcResponse<T = unknown> = { ok: true; data: T } | { ok: false; error: { message: string } }

const bridge = {
  rpc<T = unknown>(req: RpcRequest): Promise<RpcResponse<T>> {
    return ipcRenderer.invoke(IPC.RPC, req) as Promise<RpcResponse<T>>
  },

  /** 渲染进程错误统一上报；主进程负责写 electron-log + 落库 */
  reportError(payload: {
    message: string
    stack?: string
    componentStack?: string
    url?: string
  }): void {
    ipcRenderer.send(IPC.REPORT_ERROR, payload)
  },

  onJobLog(cb: (payload: { jobId: string; line: string }) => void): () => void {
    const listener = (_e: IpcRendererEvent, p: { jobId: string; line: string }) => cb(p)
    ipcRenderer.on(IPC.JOB_LOG, listener)
    return () => ipcRenderer.removeListener(IPC.JOB_LOG, listener)
  },

  onJobState(cb: (payload: { jobId: string; status: string }) => void): () => void {
    const listener = (_e: IpcRendererEvent, p: { jobId: string; status: string }) => cb(p)
    ipcRenderer.on(IPC.JOB_STATE, listener)
    return () => ipcRenderer.removeListener(IPC.JOB_STATE, listener)
  },

  env(): Promise<{
    platform: string
    versions: Record<string, string>
    isPackaged: boolean
  }> {
    return ipcRenderer.invoke(IPC.ENV) as Promise<{
      platform: string
      versions: Record<string, string>
      isPackaged: boolean
    }>
  },
}

contextBridge.exposeInMainWorld('vs', bridge)

export type PreloadBridge = typeof bridge
