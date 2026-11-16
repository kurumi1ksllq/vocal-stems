// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
/**
 * 任务调度与产物扫描 —— SidecarApi 的主进程实现。
 *
 * 职责边界（spec 纪律）：
 *   - 业务状态进 SQLite（drizzle），内存里只留运行中的子进程句柄
 *   - 重活全在 Python 子进程里，主进程只做编排和文件扫描
 *   - 所有路径校验集中在 resolveInside()
 */
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AppDb } from '@vs/shared/db'
import { jobLogs, jobs, stems } from '@vs/shared/db/schema'
import type {
  CreateJobInput,
  HealthInfo,
  JobView,
  LibraryEntry,
  ResultDir,
  SidecarApi,
  StemView,
  UploadedFile,
  WeightEntry,
} from '@vs/shared/sidecar-contract'
import { asc, desc, eq, inArray } from 'drizzle-orm'
import { mainLog } from './logger.ts'
import { probePython, type RunHandle, runPython } from './sidecar.ts'

export interface JobRunnerDeps {
  db: AppDb
  /** 仓库根（开发态）或 resources/runtime（打包后） */
  appRoot: string
  /** 可写的产物目录 */
  outRoot: string
  /** 上传暂存目录 */
  uploadsDir: string
  /** 模型目录 */
  modelsDir: string
  /** Python 解释器 */
  python: string
  /** ffmpeg */
  ffmpeg: string | null
  /** 强制 CPU */
  forceCpu: boolean
  /** 推送给渲染进程的日志/状态回调 */
  onLog: (jobId: string, line: string) => void
  onState: (jobId: string, status: string) => void
}

const MODE_SCRIPT: Record<string, string> = {
  stems: 'svc/svc_stems.py',
  karaoke: 'svc/svc_karaoke.py',
  dereverb: 'svc/svc_dereverb.py',
}

const CASCADE: Record<string, string> = {
  'karaoke:mix': '--from-mix',
  'dereverb:mix': '--from-vocals',
  'dereverb:karaoke': '--from-karaoke',
}

/** 合法的 (mode, source) 组合 */
const ALLOWED: Record<string, string[]> = {
  stems: ['mix'],
  karaoke: ['vocals', 'mix'],
  dereverb: ['vocals', 'mix', 'karaoke'],
}

export function createJobRunner(deps: JobRunnerDeps): SidecarApi {
  /** 只放运行中的进程句柄；任务本身在数据库里 */
  const running = new Map<string, RunHandle>()
  /** 每个任务的日志序号 */
  const seqOf = new Map<string, number>()

  const { db, appRoot, outRoot, uploadsDir, modelsDir, python, ffmpeg } = deps

  // ---------------------------------------------------------------- 工具

  const q = <T>(fn: () => T): T => fn()

  function ensureDirs(): void {
    for (const d of [outRoot, uploadsDir]) fs.mkdirSync(d, { recursive: true })
  }

  /** 只允许 <outRoot> 下的路径，其他一律拒绝。 */
  function resolveInside(p: string, root = outRoot): string | null {
    const r = path.resolve(root)
    const t = path.resolve(p)
    const rel = path.relative(r, t)
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return t
    return null
  }

  function toView(row: {
    id: string
    mode: string
    source: string
    filename: string
    status: string
    outputDir: string | null
    exitCode: number | null
    error: string | null
    createdAt: number
    startedAt: number | null
    finishedAt: number | null
  }): JobView {
    const end = row.finishedAt ?? Date.now()
    const start = row.startedAt ?? row.createdAt
    return {
      id: row.id,
      mode: row.mode,
      source: row.source,
      filename: row.filename,
      status: row.status,
      outDir: row.outputDir,
      exitCode: row.exitCode,
      error: row.error,
      createdAt: row.createdAt,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      elapsed: Math.max(0, Math.round((end - start) / 1000)),
    }
  }

  function setStatus(id: string, status: string, patch: Record<string, unknown> = {}): void {
    q(() =>
      db
        .update(jobs)
        .set({ status, ...patch })
        .where(eq(jobs.id, id))
        .run(),
    )
    deps.onState(id, status)
  }

  // ---------------------------------------------------------------- 探测

  async function probe(): Promise<HealthInfo> {
    ensureDirs()

    const cuda = await probePython(
      python,
      'import torch;' +
        'print(torch.cuda.is_available());' +
        "print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else '')",
      appRoot,
      30_000,
    )
    const lines = cuda.stdout
      .trim()
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
    const available = lines[0] === 'True'

    const weightFiles = fs.existsSync(modelsDir)
      ? fs
          .readdirSync(modelsDir)
          .filter((f) => f.endsWith('.ckpt'))
          .sort()
      : []

    return {
      ok: true,
      root: appRoot,
      python,
      cuda: { available, device: lines[1] || null },
      cpuFallback: deps.forceCpu || !available,
      ffmpeg: { path: ffmpeg, exists: Boolean(ffmpeg && fs.existsSync(ffmpeg)) },
      weights: weightFiles,
      outRoot,
      modelsDir,
      version: process.versions.electron ?? 'dev',
    }
  }

  // ---------------------------------------------------------------- 上传

  async function saveUpload(name: string, data: Uint8Array): Promise<UploadedFile> {
    ensureDirs()
    const ext = path.extname(name).toLowerCase()
    const allowed = [
      '.wav',
      '.mp3',
      '.flac',
      '.m4a',
      '.aac',
      '.ogg',
      '.opus',
      '.wma',
      '.aiff',
      '.aif',
      '.ape',
      '.mp4',
      '.mkv',
      '.mov',
    ]
    if (!allowed.includes(ext)) throw new Error(`不支持的音频格式: ${ext || '(无扩展名)'}`)

    const id = randomBytes(6).toString('hex')
    const target = path.join(uploadsDir, `${id}${ext}`)
    fs.writeFileSync(target, data)
    return { name, path: target, size: data.byteLength }
  }

  // ---------------------------------------------------------------- 任务

  async function createJob(input: CreateJobInput, now: number): Promise<JobView> {
    const sources = ALLOWED[input.mode]
    if (!sources) throw new Error(`未知模式: ${input.mode}`)
    if (!sources.includes(input.source)) {
      throw new Error(`${input.mode} 不支持以「${input.source}」为输入`)
    }

    // inputName 由 /upload 生成，只接受上传目录里的文件
    const inputPath = resolveInside(path.join(uploadsDir, input.inputName), uploadsDir)
    if (!inputPath || !fs.existsSync(inputPath)) throw new Error('输入音频不存在，请重新上传')

    const id = randomBytes(6).toString('hex')
    const row = {
      id,
      mode: input.mode,
      source: input.source,
      filename: input.filename,
      inputPath,
      status: 'queued',
      options: input.options,
      createdAt: now,
    }
    q(() => db.insert(jobs).values(row).run())
    seqOf.set(id, 0)

    // 立刻异步跑，不 await
    void runJob(id, input, inputPath)

    return toView({
      ...row,
      outputDir: null,
      exitCode: null,
      error: null,
      startedAt: null,
      finishedAt: null,
    })
  }

  async function runJob(id: string, input: CreateJobInput, inputPath: string): Promise<void> {
    const script = path.join(appRoot, MODE_SCRIPT[input.mode] ?? '')
    if (!MODE_SCRIPT[input.mode] || !fs.existsSync(script)) {
      const msg = `找不到分离脚本: ${MODE_SCRIPT[input.mode] ?? input.mode}`
      q(() =>
        db
          .update(jobs)
          .set({ status: 'failed', error: msg, finishedAt: Date.now() })
          .where(eq(jobs.id, id))
          .run(),
      )
      deps.onState(id, 'failed')
      return
    }

    const startedAt = Date.now()
    setStatus(id, 'running', { startedAt })

    const args: string[] = []
    const cascade = CASCADE[`${input.mode}:${input.source}`]
    if (cascade) args.push(cascade)
    args.push('--bigshifts', String(input.options.bigshifts))
    args.push('--parallel', String(input.options.parallel))
    if (input.options.fuse?.trim()) args.push('--fuse', ...input.options.fuse.trim().split(/\s+/))
    if (input.options.noMp3) args.push('--no-mp3')
    if (input.options.noEnsemble) args.push('--no-ensemble')

    const env: Record<string, string> = {
      VS_PYTHON: python,
      VS_MODELS: modelsDir,
      VS_OUT: outRoot,
    }
    if (ffmpeg) env.VS_FFMPEG = ffmpeg
    if (deps.forceCpu) env.VS_FORCE_CPU = '1'

    mainLog().info(`[job ${id}] start`, { script, input: inputPath })

    const handle = runPython({
      python,
      script,
      input: inputPath,
      outRoot,
      args,
      env,
      cwd: appRoot,
    })
    running.set(id, handle)

    let sawFailure = false
    let lastFailure = ''

    handle.on('line', (line) => {
      // tqdm 进度条挤在 \r 里，过滤掉纯进度噪声
      if (/\d+%\|/.test(line) || /it\/s\]/.test(line)) return

      const seq = (seqOf.get(id) ?? 0) + 1
      seqOf.set(id, seq)
      const at = Date.now()
      q(() => db.insert(jobLogs).values({ jobId: id, seq, line, at }).run())
      if (line.includes('[失败]')) {
        sawFailure = true
        lastFailure = line
      }
      deps.onLog(id, line)
    })

    handle.on('exit', (code) => {
      running.delete(id)
      const finishedAt = Date.now()

      // svc_*.py 单文件失败仍返回 0，必须靠日志里的 [失败] 判断
      const failed = code !== 0 || sawFailure
      const outDir = findOutputDir(id, startedAt)

      if (failed) {
        const err = sawFailure ? lastFailure : `退出码 ${code}`
        q(() =>
          db
            .update(jobs)
            .set({ status: 'failed', error: err, exitCode: code, finishedAt, outputDir: outDir })
            .where(eq(jobs.id, id))
            .run(),
        )
        deps.onState(id, 'failed')
        mainLog().warn(`[job ${id}] failed`, { code, err })
        return
      }

      q(() =>
        db
          .update(jobs)
          .set({ status: 'done', exitCode: code, finishedAt, outputDir: outDir })
          .where(eq(jobs.id, id))
          .run(),
      )
      if (outDir) persistStems(id, outDir)
      deps.onState(id, 'done')
      mainLog().info(`[job ${id}] done`, { outDir })
    })
  }

  /**
   * 找本次任务的产物目录。
   *
   * svc 脚本用 `<时间戳>_<输入文件名>_<标签>` 命名，输入文件名就是
   * `<jobId>.wav`，所以目录名必含 jobId —— 按它认领，并发时不会串。
   */
  function findOutputDir(jobId: string, startedAt: number): string | null {
    if (!fs.existsSync(outRoot)) return null
    const dirs = fs
      .readdirSync(outRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.includes(jobId))
      .map((d) => path.join(outRoot, d.name))

    if (dirs.length > 0) return dirs.sort().at(-1) ?? null

    // 兜底：按开始时间找新目录
    const cutoff = startedAt - 5000
    const fresh = fs
      .readdirSync(outRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(outRoot, d.name))
      .filter((p) => {
        try {
          return fs.statSync(p).mtimeMs >= cutoff
        } catch {
          return false
        }
      })
    return fresh.sort().at(-1) ?? null
  }

  function persistStems(jobId: string, dir: string): void {
    const rows = scanStems(dir).map((s) => ({
      jobId,
      path: s.path,
      label: s.label,
      kind: s.kind,
      fused: s.fused,
      fuseMode: s.fuseMode,
      size: s.size,
    }))
    if (rows.length === 0) return
    q(() =>
      db.transaction((tx) => {
        tx.delete(stems).where(eq(stems.jobId, jobId)).run()
        tx.insert(stems).values(rows).run()
      }),
    )
  }

  // ---------------------------------------------------------------- 查询

  async function listJobs(limit: number): Promise<JobView[]> {
    const rows = q(() => db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(limit).all())
    return rows.map(toView)
  }

  async function getJob(id: string): Promise<JobView | null> {
    const row = q(() => db.select().from(jobs).where(eq(jobs.id, id)).get())
    return row ? toView(row) : null
  }

  async function cancelJob(id: string): Promise<boolean> {
    const handle = running.get(id)
    if (!handle) return false
    setStatus(id, 'cancelled', { finishedAt: Date.now() })
    handle.kill()
    running.delete(id)
    return true
  }

  async function deleteJob(id: string): Promise<void> {
    const handle = running.get(id)
    if (handle) {
      handle.kill()
      running.delete(id)
    }
    q(() => db.delete(jobs).where(eq(jobs.id, id)).run())
    seqOf.delete(id)
  }

  async function getLogs(id: string): Promise<string[]> {
    const rows = q(() =>
      db
        .select({ line: jobLogs.line })
        .from(jobLogs)
        .where(eq(jobLogs.jobId, id))
        .orderBy(asc(jobLogs.seq))
        .all(),
    )
    return rows.map((r) => r.line)
  }

  async function getResult(id: string): Promise<ResultDir | null> {
    const row = q(() => db.select().from(jobs).where(eq(jobs.id, id)).get())
    if (!row?.outputDir) return null
    const dir = resolveInside(row.outputDir)
    if (!dir || !fs.existsSync(dir)) return null
    return readDir(dir)
  }

  // ---------------------------------------------------------------- 产物

  function scanStems(dir: string): (StemView & { kind: string })[] {
    const mp3Dir = path.join(dir, 'mp3_试听')
    const out: (StemView & { kind: string })[] = []
    let entries: string[]
    try {
      entries = fs.readdirSync(dir)
    } catch {
      return out
    }

    for (const name of entries.sort()) {
      if (!name.toLowerCase().endsWith('.wav') || name.startsWith('_')) continue
      const full = path.join(dir, name)
      let size = 0
      try {
        size = fs.statSync(full).size
      } catch {
        continue
      }
      const { kind, label } = classify(name)
      const fused = name.includes('融合')
      const fuseMode = /(mag_\w+|median_fft|avg_fft)/.exec(name)?.[1] ?? null
      const mp3 = path.join(mp3Dir, `${path.basename(name, '.wav')}.mp3`)
      out.push({
        name,
        path: full,
        label,
        kind,
        fused,
        fuseMode,
        size,
        url: `${MEDIA_PLACEHOLDER}${encodeURIComponent(full)}`,
        mp3Url: fs.existsSync(mp3) ? `${MEDIA_PLACEHOLDER}${encodeURIComponent(mp3)}` : null,
      })
    }
    return out
  }

  function readDir(dir: string): ResultDir {
    const list = scanStems(dir)
    let mtime = Date.now()
    try {
      mtime = fs.statSync(dir).mtimeMs
    } catch {
      /* 用当前时间兜底 */
    }
    return { dir, name: path.basename(dir), mtime, stems: list }
  }

  async function listLibrary(): Promise<LibraryEntry[]> {
    if (!fs.existsSync(outRoot)) return []
    const out: LibraryEntry[] = []
    for (const d of fs.readdirSync(outRoot, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name.startsWith('_') || d.name.startsWith('.')) continue
      const full = path.join(outRoot, d.name)
      let files: string[]
      try {
        files = fs.readdirSync(full).filter((f) => f.endsWith('.wav') && !f.startsWith('_'))
      } catch {
        continue
      }
      if (files.length === 0) continue
      let size = 0
      for (const f of files) {
        try {
          size += fs.statSync(path.join(full, f)).size
        } catch {
          /* 跳过不可读 */
        }
      }
      out.push({
        name: d.name,
        dir: full,
        mtime: fs.statSync(full).mtimeMs,
        count: files.length,
        size,
      })
    }
    return out.sort((a, b) => b.mtime - a.mtime)
  }

  async function readOutDir(dir: string): Promise<ResultDir | null> {
    const target = resolveInside(dir)
    if (!target || !fs.existsSync(target) || !fs.statSync(target).isDirectory()) return null
    return readDir(target)
  }

  async function listWeights(): Promise<WeightEntry[]> {
    if (!fs.existsSync(modelsDir)) return []
    return fs
      .readdirSync(modelsDir)
      .filter((f) => f.endsWith('.ckpt'))
      .sort()
      .map((name) => {
        const full = path.join(modelsDir, name)
        const st = fs.statSync(full)
        return { name, size: st.size, mtime: st.mtimeMs }
      })
  }

  async function reveal(target: string): Promise<boolean> {
    const dir = resolveInside(target)
    if (!dir || !fs.existsSync(dir)) return false
    if (process.platform === 'win32') {
      execFile('explorer', [dir], () => {})
    } else if (process.platform === 'darwin') {
      execFile('open', [dir], () => {})
    } else {
      execFile('xdg-open', [dir], () => {})
    }
    return true
  }

  /** 退出时把还在跑的任务全部杀掉 */
  async function killAll(): Promise<void> {
    for (const [id, h] of running) {
      h.kill()
      running.delete(id)
    }
  }

  /**
   * 启动时收尸。
   *
   * `running` 这个 Map 活在内存里，进程一退就空。但数据库里的 queued/running
   * 是持久化的，所以上一次异常退出（关窗口、Ctrl+C、崩溃）会留下永远停在
   * 「处理中」的僵尸任务——界面上还按 running 显示，也会永远把「当前任务」
   * 占住。启动时把这些行改成 interrupted，界面就不会再骗人。
   */
  async function reapStale(): Promise<number> {
    const stale = q(() =>
      db
        .select({ id: jobs.id })
        .from(jobs)
        .where(inArray(jobs.status, ['queued', 'running']))
        .all(),
    )
    if (stale.length === 0) return 0

    const ids = stale.map((r) => r.id)
    const now = Date.now()
    q(() =>
      db
        .update(jobs)
        .set({ status: 'interrupted', error: '应用退出时任务未结束', finishedAt: now })
        .where(inArray(jobs.id, ids))
        .run(),
    )
    for (const id of ids) {
      deps.onState(id, 'interrupted')
      running.delete(id)
    }
    mainLog().warn('[reap] 上次退出遗留的任务已标记为 interrupted', { count: ids.length, ids })
    return ids.length
  }

  return {
    probe,
    createJob,
    listJobs,
    getJob,
    cancelJob,
    deleteJob,
    getLogs,
    getResult,
    saveUpload,
    listLibrary,
    readOutDir,
    listWeights,
    reveal,
    // 内部用，不作为 RPC 暴露
    ...({ killAll, reapStale } as object),
  } as SidecarApi & { killAll: () => Promise<void>; reapStale: () => Promise<number> }
}

/** 与 media-protocol.ts 的 scheme 保持一致；这里只拼尾部。 */
const MEDIA_PLACEHOLDER = 'vs-media://local/'

const RULES: [RegExp, string, string][] = [
  [/人声.*含和声|人声总轨/i, 'vocal', '人声（含和声）'],
  [/伴奏/i, 'inst', '伴奏'],
  [/纯主唱/i, 'vocal', '纯主唱'],
  [/和声/i, 'backing', '和声'],
  [/去混响|干声|noreverb/i, 'dereverb', '干声（去混响）'],
  [/混响成分|reverb$/i, 'reverb', '混响成分'],
]

function classify(name: string): { kind: string; label: string } {
  for (const [re, kind, label] of RULES) {
    if (re.test(name)) return { kind, label }
  }
  return { kind: 'other', label: '其他' }
}

/** 仅供测试/调试：按平台惯例给默认路径。 */
export function defaultPaths() {
  return {
    home: os.homedir(),
    documents: path.join(os.homedir(), 'Documents'),
  }
}
