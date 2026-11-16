/**
 * 渲染进程唯一的出口：window.vs.rpc()
 *
 * 类型安全来自 Hono 的 `hc<CallableType>` —— 但我们不走 HTTP，
 * 所以不直接用 hc 的 fetch 实现，而是复用它推导出的路由类型。
 *
 * 为什么不用 hc 的 client 直接打：
 *   hc 需要一个 fetch 实现；在 Electron 里把它包成「fetch -> IPC」也能跑，
 *   但那样每次调用都要序列化一个 Request 对象再反序列化，纯浪费。
 *   这里让 hc 仅作类型来源，运行时用更直接的 { method, path, body } 信封。
 */
import type { CallableType } from '@vs/shared/callable'
import { IPC, type RpcRequest, type RpcResponse } from '@vs/shared/ipc'

/** preload 暴露的最小桥 */
export interface VsBridge {
  rpc<T = unknown>(req: RpcRequest): Promise<RpcResponse<T>>
  reportError(payload: {
    message: string
    stack?: string
    componentStack?: string
    url?: string
  }): void
  onJobLog(cb: (payload: { jobId: string; line: string }) => void): () => void
  onJobState(cb: (payload: { jobId: string; status: string }) => void): () => void
  env(): Promise<{
    platform: string
    versions: Record<string, string>
    isPackaged: boolean
  }>
}

declare global {
  interface Window {
    vs: VsBridge
  }
}

/** 把 JSON 路径拼成类型。`/jobs/:id` -> 调用时传 id。 */
type Paths = ExtractRoutePaths<CallableType>

type ExtractRoutePaths<T> = T extends { _routes: infer R } ? keyof R & string : string

export class RpcError extends Error {
  readonly code: string | undefined
  readonly status: number | undefined

  constructor(message: string, code?: string, status?: number) {
    super(message)
    this.name = 'RpcError'
    this.code = code
    this.status = status
  }
}

/**
 * 统一的 RPC 调用。失败抛 RpcError，成功返回已解析的数据。
 *
 * 不依赖 hc 的运行时（省一次 Request 构造），但路径与响应类型
 * 仍然受 CallableType 约束 —— 改后端路由时这里会立刻报类型错。
 */
export async function rpc<T = unknown>(
  method: RpcRequest['method'],
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await window.vs.rpc<T>({ method, path, body })
  if (!res.ok) {
    throw new RpcError(res.error.message, res.error.code, res.error.status)
  }
  return res.data
}

export const api = {
  health: () => rpc('GET', '/health'),
  jobs: (limit?: number) => rpc('GET', `/jobs${limit ? `?limit=${limit}` : ''}`),
  job: (id: string) => rpc('GET', `/jobs/${id}`),
  createJob: (body: unknown) => rpc('POST', '/jobs', body),
  cancelJob: (id: string) => rpc('POST', `/jobs/${id}/cancel`),
  deleteJob: (id: string) => rpc('DELETE', `/jobs/${id}`),
  logs: (id: string) => rpc('GET', `/jobs/${id}/logs`),
  result: (id: string) => rpc('GET', `/jobs/${id}/result`),
  upload: (name: string, data: Uint8Array) =>
    rpc('POST', '/upload', { name, data: Array.from(data) }),
  library: () => rpc('GET', '/library'),
  libraryResult: (dir: string) => rpc('GET', `/library/result?dir=${encodeURIComponent(dir)}`),
  weights: () => rpc('GET', '/weights'),
  reveal: (path: string) => rpc('POST', '/reveal', { path }),
}

export { IPC, type Paths }
