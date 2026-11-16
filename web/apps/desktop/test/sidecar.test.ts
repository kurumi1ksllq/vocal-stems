/**
 * Electron 主进程的 vitest 测试：sidecar 进程管理与路径校验。
 *
 * 不起 Electron —— 这些模块不依赖 electron 运行时。
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { firstExisting, killTree, probePython, runPython } from '../src/main/sidecar.ts'

const python = process.platform === 'win32' ? 'python' : 'python3'

describe('firstExisting', () => {
  it('返回第一个存在的路径', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-'))
    const a = path.join(tmp, 'a.txt')
    fs.writeFileSync(a, 'x')
    expect(firstExisting([path.join(tmp, 'nope'), a])).toBe(path.resolve(a))
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('全都不存在时返回 null', () => {
    expect(firstExisting(['/definitely/not/here', undefined])).toBeNull()
  })

  it('忽略 undefined', () => {
    expect(firstExisting([undefined, undefined])).toBeNull()
  })
})

describe('probePython', () => {
  it('能拿到 stdout', async () => {
    const r = await probePython(python, 'print(1 + 1)')
    expect(r.ok).toBe(true)
    expect(r.stdout.trim()).toBe('2')
  })

  it('退出码非 0 时 ok=false', async () => {
    const r = await probePython(python, 'raise SystemExit(3)')
    expect(r.ok).toBe(false)
  })

  it('超时会杀掉进程', async () => {
    const start = Date.now()
    const r = await probePython(python, 'import time; time.sleep(30)', undefined, 800)
    expect(r.ok).toBe(false)
    expect(Date.now() - start).toBeLessThan(5000)
  })
})

describe('runPython', () => {
  const handles: { kill: () => void }[] = []

  afterEach(() => {
    for (const h of handles) h.kill()
    handles.length = 0
  })

  it('逐行回调 stdout', async () => {
    const script = path.join(os.tmpdir(), `vs-line-${Date.now()}.py`)
    fs.writeFileSync(script, 'for i in range(3):\n    print(f"line-{i}")\n')

    const lines: string[] = []
    const done = new Promise<number | null>((resolve) => {
      const h = runPython({ python, script, input: '', outRoot: '', args: [] })
      handles.push(h)
      h.on('line', (l: string) => lines.push(l))
      h.on('exit', (code: number | null) => resolve(code))
    })

    const code = await done
    fs.rmSync(script, { force: true })
    expect(code).toBe(0)
    expect(lines).toEqual(['line-0', 'line-1', 'line-2'])
  })

  it('把 \\r 也当行分隔（tqdm 进度）', async () => {
    const script = path.join(os.tmpdir(), `vs-cr-${Date.now()}.py`)
    fs.writeFileSync(
      script,
      'import sys\nsys.stdout.write("10%\\r50%\\r100%\\n")\nsys.stdout.flush()\n',
    )

    const lines: string[] = []
    const done = new Promise<void>((resolve) => {
      const h = runPython({ python, script, input: '', outRoot: '', args: [] })
      handles.push(h)
      h.on('line', (l: string) => lines.push(l))
      h.on('exit', () => resolve())
    })

    await done
    fs.rmSync(script, { force: true })
    expect(lines).toContain('10%')
    expect(lines).toContain('50%')
    expect(lines).toContain('100%')
  })

  it('传参顺序是 script, input, ...args', async () => {
    const script = path.join(os.tmpdir(), `vs-args-${Date.now()}.py`)
    fs.writeFileSync(script, 'import sys\nprint("|".join(sys.argv[1:]))\n')

    const lines: string[] = []
    const done = new Promise<void>((resolve) => {
      const h = runPython({
        python,
        script,
        input: 'INPUT.wav',
        outRoot: '',
        args: ['--bigshifts', '2'],
      })
      handles.push(h)
      h.on('line', (l: string) => lines.push(l))
      h.on('exit', () => resolve())
    })

    await done
    fs.rmSync(script, { force: true })
    expect(lines[0]).toBe('INPUT.wav|--bigshifts|2')
  })
})

describe('killTree', () => {
  it('杀父进程时子进程也死（Windows 用 taskkill /T）', async () => {
    // 父进程再 spawn 一个 sleep，模拟 svc_*.py -> inference.py 的两层结构
    const code = `
import subprocess, sys, time
child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'])
print(child.pid, flush=True)
time.sleep(30)
`
    const parent = spawn(python, ['-u', '-c', code], { stdio: ['ignore', 'pipe', 'pipe'] })
    const childPid = await new Promise<number>((resolve) => {
      let buf = ''
      parent.stdout?.on('data', (d: Buffer) => {
        buf += d.toString('utf8')
        const m = /^(\d+)/.exec(buf)
        if (m?.[1]) resolve(Number(m[1]))
      })
    })

    expect(parent.pid).toBeTypeOf('number')
    if (parent.pid === undefined) throw new Error('父进程没有 pid')
    killTree(parent.pid)

    // 给 taskkill 一点时间
    await new Promise((r) => setTimeout(r, 2000))

    let childAlive = true
    try {
      process.kill(childPid, 0)
    } catch {
      childAlive = false
    }
    expect(childAlive).toBe(false)
  }, 20_000)
})
