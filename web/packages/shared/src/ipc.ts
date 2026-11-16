/**
 * IPC 通道名与协议常量。
 *
 * 渲染进程<->主进程只有一个业务通道：Hono RPC over IPC。
 * 其余是几个非业务的固定通道（错误上报、窗口控制）。
 */
export const IPC = {
  /** Hono RPC 的唯一入口。payload = { method, path, body } */
  RPC: 'vs:rpc',
  /** 任务日志流式推送（主进程 -> 渲染进程） */
  JOB_LOG: 'vs:job-log',
  /** 任务状态变更（主进程 -> 渲染进程） */
  JOB_STATE: 'vs:job-state',
  /** 渲染进程错误上报（渲染进程 -> 主进程） */
  REPORT_ERROR: 'vs:report-error',
  /** 环境信息（只读，启动时拿一次） */
  ENV: 'vs:env',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

/** RPC 请求信封 */
export interface RpcRequest {
  method: 'GET' | 'POST' | 'DELETE'
  /** 相对路径，接口以 / 开头，如 `/jobs`、`/jobs/abc/result` */
  path: string
  body?: unknown
}

/** RPC 响应信封：成功带 data，失败带 error */
export type RpcResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { message: string; code?: string; status?: number } }

/** 渲染进程上报的错误形状 */
export interface RendererErrorPayload {
  message: string
  stack?: string
  componentStack?: string
  url?: string
}
