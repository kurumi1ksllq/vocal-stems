#!/usr/bin/env node
/**
 * 用项目自己的 .venv 启动 FastAPI 后端。
 * 直接用 pnpm server 就能跑，不用记 venv 的 python 路径。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..') // 仓库根目录
const webDir = resolve(here, '..')

const candidates = [
  join(root, '.venv', 'Scripts', 'python.exe'), // Windows
  join(root, '.venv', 'bin', 'python'), // POSIX
  process.env.PYTHON,
].filter(Boolean)

const python = candidates.find((p) => existsSync(p))

if (!python) {
  console.error(
    [
      '找不到项目虚拟环境里的 Python。',
      `已尝试：`,
      ...candidates.map((c) => `  - ${c}`),
      '',
      '请在仓库根目录创建 venv（见 README）。',
    ].join('\n'),
  )
  process.exit(1)
}

const args = [join(webDir, 'server', 'app.py'), ...process.argv.slice(2)]
console.log(`[web] 使用 ${python}`)
console.log(`[web] 启动后端 http://127.0.0.1:8765`)

const child = spawn(python, args, { cwd: root, stdio: 'inherit' })

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => child.kill(sig))
}
