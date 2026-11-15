/** 与 web/server/app.py 的契约。字段名保持和 Python 端一致（camelCase 已对齐）。 */

export type ModeKey = 'stems' | 'karaoke' | 'dereverb'
export type SourceKey = 'mix' | 'vocals' | 'karaoke'

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

export interface Job {
  id: string
  mode: ModeKey
  source: SourceKey
  filename: string
  status: JobStatus
  created_at: number
  started_at: number | null
  finished_at: number | null
  exit_code: number | null
  out_dir: string | null
  error: string | null
  cmd: string[]
  elapsed: number
}

export interface Health {
  ok: boolean
  root: string
  python: string
  venvReady: boolean
  cuda: { available: boolean; device: string | null }
  ffmpeg: { path: string | null; exists: boolean }
  weights: string[]
  outRoot: string
  modes: Record<ModeKey, ModeInfo>
}

export interface ModeInfo {
  label: string
  desc: string
  accepts: 'mix' | 'vocals'
  steps: string[]
}

export interface Stem {
  name: string
  key: string
  label: string
  fused: boolean
  fuseMode: string | null
  size: number
  url: string
  mp3Url: string | null
}

export interface ResultDir {
  dir: string
  name: string
  mtime: number
  stems: Stem[]
  mp3Dir: string | null
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

const BASE = '/api'

async function jfetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = (await res.json()) as { detail?: string }
      if (body.detail) detail = body.detail
    } catch {
      /* 非 JSON 错误体，用状态码兜底 */
    }
    throw new Error(detail)
  }
  return (await res.json()) as T
}

export const api = {
  health: () => jfetch<Health>(`${BASE}/health`),

  weights: () => jfetch<WeightEntry[]>(`${BASE}/weights`),

  jobs: () => jfetch<Job[]>(`${BASE}/jobs`),

  job: (id: string) => jfetch<Job>(`${BASE}/jobs/${id}`),

  jobLogs: (id: string) => jfetch<{ lines: string[] }>(`${BASE}/jobs/${id}/logs`),

  jobResult: (id: string) => jfetch<ResultDir>(`${BASE}/jobs/${id}/result`),

  cancel: (id: string) =>
    jfetch<{ ok: boolean }>(`${BASE}/jobs/${id}/cancel`, { method: 'POST' }),

  remove: (id: string) =>
    jfetch<{ ok: boolean }>(`${BASE}/jobs/${id}`, { method: 'DELETE' }),

  library: () => jfetch<LibraryEntry[]>(`${BASE}/library`),

  libraryResult: (dir: string) =>
    jfetch<ResultDir>(`${BASE}/library/result?path=${encodeURIComponent(dir)}`),

  /** 在本机资源管理器里打开产物目录 */
  reveal: (dir: string) =>
    jfetch<{ ok: boolean }>(`${BASE}/reveal?path=${encodeURIComponent(dir)}`, {
      method: 'POST',
    }),

  createJob: (
    file: File,
    mode: ModeKey,
    source: SourceKey,
    opts: JobOptions,
  ): Promise<Job> => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('mode', mode)
    fd.append('source', source)
    fd.append('bigshifts', String(opts.bigshifts))
    fd.append('parallel', String(opts.parallel))
    fd.append('fuse', opts.fuse)
    fd.append('no_mp3', String(opts.noMp3))
    fd.append('no_ensemble', String(opts.noEnsemble))
    return jfetch<Job>(`${BASE}/jobs`, { method: 'POST', body: fd })
  },
}

/** 订阅任务日志。返回取消订阅函数。 */
export function streamLogs(
  id: string,
  handlers: {
    onLine?: (line: string) => void
    onProgress?: (text: string) => void
    onEnd?: (code: number) => void
    onError?: (err: Event) => void
  },
): () => void {
  const es = new EventSource(`${BASE}/jobs/${id}/stream`)

  es.addEventListener('line', (e) => {
    handlers.onLine?.(JSON.parse((e as MessageEvent<string>).data) as string)
  })
  es.addEventListener('progress', (e) => {
    handlers.onProgress?.(JSON.parse((e as MessageEvent<string>).data) as string)
  })
  es.addEventListener('end', (e) => {
    const code = Number(JSON.parse((e as MessageEvent<string>).data))
    handlers.onEnd?.(code)
    es.close()
  })
  es.onerror = (e) => {
    // 服务端主动关闭后 EventSource 会重连，这里直接收掉
    handlers.onError?.(e)
    es.close()
  }

  return () => es.close()
}
