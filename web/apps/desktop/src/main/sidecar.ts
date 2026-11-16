// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
/**
 * Python 推理进程（sidecar）的契约与实现。
 *
 * 关键纪律（来自 spec）：CPU 密集任务不阻塞主进程 —— 但本项目真正的重活
 * 是 PyTorch 推理，只能放 Python。所以这里不做 utilityProcess，
 * 而是 spawn 一个独立进程，把它当成「会说话的 CLI」。
 *
 * 为什么不用 FastAPI + 回环 HTTP：
 *   - 多一个监听端口就多一份被本机其它进程探测的面
 *   - 渲染进程本来就不该直连 Python，主进程转发已经够了
 *   - 少了 uvicorn 依赖和启动开销
 * 所以 Python 侧退化成纯 CLI（svc/*.py 本来就是），
 * 主进程只解析它的 stdout 拿进度，产物从文件系统读。
 */
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'

export interface RunOptions {
  /** 解释器绝对路径 */
  python: string
  /** 要跑的脚本绝对路径（svc/svc_stems.py 等） */
  script: string
  /** 输入音频绝对路径 */
  input: string
  /** 产物根目录 */
  outRoot: string
  /** 传给脚本的参数 */
  args: string[]
  /** 额外环境变量 */
  env?: Record<string, string>
  /** 工作目录 */
  cwd?: string
}

export interface RunHandle {
  pid: number
  /** 逐行 stdout/stderr */
  on(event: 'line', cb: (line: string) => void): this
  on(event: 'exit', cb: (code: number | null, signal: string | null) => void): this
  kill(): void
}

/**
 * 起一个 Python 推理进程。
 *
 * stdout/stderr 合并后按行切分 —— svc 脚本的进度是纯文本，
 * 不需要结构化协议。tqdm 的 \r 会被切成行，后面由上层过滤。
 */
export function runPython(opts: RunOptions): RunHandle {
  const child = spawn(opts.python, ['-u', opts.script, opts.input, ...opts.args], {
    cwd: opts.cwd,
    env: {
      ...process.env,
      ...opts.env,
      PYTHONPATH: '',
      PYTHONIOENCODING: 'utf-8',
      PYTHONUNBUFFERED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  return wrap(child as unknown as ChildProcessWithoutNullStreams)
}

/** 起一个简短的 Python 探测命令（如 cuda 可用性），收集全部输出。 */
export function probePython(
  python: string,
  code: string,
  cwd?: string,
  timeoutMs = 30_000,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(python, ['-c', code], {
      cwd,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONPATH: '' },
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill(), timeoutMs)

    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString('utf8')
    })
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString('utf8')
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve({ ok: false, stdout, stderr })
    })
    child.on('exit', (code_) => {
      clearTimeout(timer)
      resolve({ ok: code_ === 0, stdout, stderr })
    })
  })
}

/**
 * 杀进程树。
 *
 * 两次 spawn：后端 -> svc_*.py -> inference.py。只 kill 第一层会留孤儿，
 * 所以 Windows 用 taskkill /T，POSIX 用进程组。
 */
export function killTree(pid: number): void {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    }).on('error', () => {
      /* 进程可能已退出 */
    })
    return
  }
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      /* 已退出 */
    }
  }
}

/** 在候选路径里找第一个存在的可执行文件。 */
export function firstExisting(candidates: (string | undefined)[]): string | null {
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return path.resolve(p)
  }
  return null
}

function wrap(child: ChildProcessWithoutNullStreams): RunHandle {
  // spawn 里的 stdio: ['ignore', 'pipe', 'pipe'] 让 stdin 为 null，
  // 类型上说是 WithoutNullStreams 但实际不是，这里只用到 stdout/stderr。
  const proc = child as unknown as {
    pid?: number
    stdout: NodeJS.ReadableStream
    stderr: NodeJS.ReadableStream
    on(event: string, cb: (...args: unknown[]) => void): void
  }
  const emitter = new EventEmitter()
  const buffer = { rest: '' }

  const flush = (text: string, isFinal = false) => {
    const combined = buffer.rest + text
    // 同时按 \n 和 \r 切：tqdm 用 \r 刷新进度
    const parts = combined.split(/\r\n|\n|\r/)
    buffer.rest = isFinal ? '' : (parts.pop() ?? '')
    for (const line of parts) {
      if (line.trim()) emitter.emit('line', line)
    }
  }

  const onData = (d: string) => flush(d)
  proc.stdout.on('data', (d: Buffer) => onData(d.toString('utf8')))
  proc.stderr.on('data', (d: Buffer) => onData(d.toString('utf8')))

  proc.on('exit', (code: unknown, signal: unknown) => {
    flush('', true)
    emitter.emit('exit', code as number | null, signal as string | null)
  })

  const handle = emitter as unknown as RunHandle
  handle.pid = proc.pid ?? -1
  handle.kill = () => {
    if (proc.pid) killTree(proc.pid)
  }
  return handle
}
