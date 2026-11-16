/**
 * 渲染进程的项目 API 门面。
 *
 * 底层是 window.vs.rpc()（Hono 路由 over IPC），这一层只做：
 *   - 把 RPC 的扁平响应映射成组件用的类型
 *   - 把「日志流」从 EventSource 换成 preload 提供的 IPC 订阅
 *
 * 组件不直接碰 window.vs，全部走这里。
 */
import { rpc, api as rpcApi } from './rpc.ts'

export type ModeKey = 'stems' | 'karaoke' | 'dereverb'
export type SourceKey = 'mix' | 'vocals' | 'karaoke'
export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

/** 主进程返回的 JobView（字段名与 shared/sidecar-contract.ts 一致） */
export interface Job {
  id: string
  mode: ModeKey
  source: SourceKey
  filename: string
  status: JobStatus
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
  exitCode: number | null
  outDir: string | null
  error: string | null
  elapsed: number
}

export interface Health {
  ok: boolean
  root: string
  python: string
  cuda: { available: boolean; device: string | null }
  cpuFallback: boolean
  ffmpeg: { path: string | null; exists: boolean }
  weights: string[]
  outRoot: string
  modelsDir: string
  version: string
}

export interface ModeInfo {
  label: string
  desc: string
  accepts: 'mix' | 'vocals'
  steps: string[]
}

export interface Stem {
  name: string
  path: string
  label: string
  kind: string
  fused: boolean
  fuseMode: string | null
  size: number
  /** vs-media:// 地址，<audio src> 直接用 */
  url: string
  mp3Url: string | null
}

export interface ResultDir {
  dir: string
  name: string
  mtime: number
  stems: Stem[]
}

export interface LibraryEntry {
  name: string
  dir: string
  mtime: number
  count: number
  size: number
}

export interface WeightEntry {
  name: string
  size: number
  mtime: number
}

export interface JobOptions {
  bigshifts: number
  parallel: number
  fuse: string
  noMp3: boolean
  noEnsemble: boolean
}

export interface UploadedFile {
  name: string
  path: string
  size: number
}

/** 把 File 读成字节交给主进程落盘（主进程只收 ArrayBuffer 形式） */
async function upload(file: File): Promise<UploadedFile> {
  const buf = new Uint8Array(await file.arrayBuffer())
  return rpc<UploadedFile>('POST', '/upload', {
    name: file.name,
    data: Array.from(buf),
  })
}

export const api = {
  health: () => rpcApi.health() as Promise<Health>,

  weights: () => rpcApi.weights() as Promise<WeightEntry[]>,

  jobs: () => rpcApi.jobs() as Promise<Job[]>,

  job: (id: string) => rpcApi.job(id) as Promise<Job>,

  jobLogs: (id: string) => rpcApi.logs(id) as Promise<{ lines: string[] }>,

  jobResult: (id: string) => rpcApi.result(id) as Promise<ResultDir>,

  cancel: (id: string) => rpcApi.cancelJob(id) as Promise<{ ok: boolean }>,

  remove: (id: string) => rpcApi.deleteJob(id) as Promise<{ ok: boolean }>,

  library: () => rpcApi.library() as Promise<LibraryEntry[]>,

  libraryResult: (dir: string) => rpcApi.libraryResult(dir) as Promise<ResultDir>,

  reveal: (dir: string) => rpcApi.reveal(dir) as Promise<{ ok: boolean }>,

  /**
   * 创建任务：先上传，再建 job。
   * 两步分开是因为主进程需要拿到落盘后的文件名。
   */
  createJob: async (
    file: File,
    mode: ModeKey,
    source: SourceKey,
    opts: JobOptions,
  ): Promise<Job> => {
    const saved = await upload(file)
    const inputName = saved.path.split(/[\\/]/).pop() ?? saved.name
    return rpc<Job>('POST', '/jobs', {
      mode,
      source,
      filename: saved.name,
      inputName,
      options: {
        bigshifts: opts.bigshifts,
        parallel: opts.parallel,
        fuse: opts.fuse || undefined,
        noMp3: opts.noMp3,
        noEnsemble: opts.noEnsemble,
      },
    })
  },
}

/**
 * 订阅任务日志。
 *
 * 旧实现用 EventSource 打 SSE；现在主进程直接 push IPC 事件，
 * 返回一个取消订阅函数，语义与原来一致。
 */
export function streamLogs(
  jobId: string,
  handlers: {
    onLine?: (line: string) => void
    onProgress?: (text: string) => void
    onEnd?: (code: number) => void
    onError?: (err: Event) => void
  },
): () => void {
  const offLog = window.vs.onJobLog((payload) => {
    if (payload.jobId !== jobId) return
    handlers.onLine?.(payload.line)
    const m = /(\d+)%/.exec(payload.line)
    if (m) handlers.onProgress?.(`推理进度 ${m[1]}%`)
  })

  const offState = window.vs.onJobState((payload) => {
    if (payload.jobId !== jobId) return
    if (payload.status === 'done') handlers.onEnd?.(0)
    else if (payload.status === 'failed') handlers.onEnd?.(1)
    else if (payload.status === 'cancelled') handlers.onEnd?.(2)
  })

  return () => {
    offLog()
    offState()
  }
}
