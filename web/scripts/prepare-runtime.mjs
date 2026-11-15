#!/usr/bin/env node
/**
 * 组装打包用的完整运行目录 build/runtime/。
 *
 * 目标：build/runtime/ 就是一个能独立跑的「应用根」，打包后原样复制到
 * resources/runtime/，main.cjs 只要把 APP_ROOT 指过去即可，不需要再拼路径。
 *
 * 目录结构（与开发时的仓库布局保持一致）：
 *   runtime/
 *     web/server/app.py       后端
 *     web/dist/               前端静态文件
 *     svc_stems.py ...        三件套
 *     inference.py ensemble.py
 *     utils/                  inference 依赖
 *     models/                 权重 + 结构定义
 *     python/                 独立 Python 运行时
 *     bin/ffmpeg.exe
 *
 * 为什么不用 venv：venv 里的 python.exe 只是个壳，靠 pyvenv.cfg 指向开发机的
 * 绝对路径，复制到别的机器就废了。这里复制 uv 的 standalone CPython（自包含），
 * 再把已装好的 site-packages 合并进去。
 *
 * 用法：node scripts/prepare-runtime.mjs [--skip-python] [--skip-models]
 */
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const webDir = resolve(here, '..')
const repoRoot = resolve(webDir, '..')
const runtimeDir = join(webDir, 'build', 'runtime')

const flags = new Set(process.argv.slice(2))
const skipPython = flags.has('--skip-python')
const skipModels = flags.has('--skip-models')

const log = (m) => console.log(`[runtime] ${m}`)
const mb = (n) => `${(n / 1024 / 1024).toFixed(0)} MB`

function dirSize(p) {
  if (!existsSync(p)) return 0
  let total = 0
  const stack = [p]
  while (stack.length) {
    const cur = stack.pop()
    const st = statSync(cur)
    if (st.isDirectory()) {
      for (const e of readdirSync(cur)) stack.push(join(cur, e))
    } else {
      total += st.size
    }
  }
  return total
}

/** 读 .venv/pyvenv.cfg 拿到 base python 目录（uv 装的 standalone）。 */
function readBasePython() {
  const cfg = join(repoRoot, '.venv', 'pyvenv.cfg')
  if (!existsSync(cfg)) return null
  const m = /^home\s*=\s*(.+)$/m.exec(readFileSync(cfg, 'utf8'))
  return m ? m[1].trim() : null
}

// ---------------------------------------------------------------- Python

function preparePython() {
  const base = readBasePython()
  if (!base) throw new Error('读不到 .venv/pyvenv.cfg 的 home，无法定位 base python')
  if (!existsSync(join(base, 'python.exe'))) {
    throw new Error(`base python 不存在: ${join(base, 'python.exe')}`)
  }

  const dest = join(runtimeDir, 'python')
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })

  log(`复制 base python: ${base}`)
  // 只带运行时必需项；tcl / include / libs 对推理无用
  const wanted = [
    'python.exe',
    'python3.dll',
    'python311.dll',
    'vcruntime140.dll',
    'vcruntime140_1.dll',
    'DLLs',
    'Lib',
  ]
  for (const item of wanted) {
    const src = join(base, item)
    if (existsSync(src)) cpSync(src, join(dest, item), { recursive: true })
  }

  // 合并 venv 里已装好的第三方包
  const venvSite = join(repoRoot, '.venv', 'Lib', 'site-packages')
  const destSite = join(dest, 'Lib', 'site-packages')
  log(`复制 site-packages: ${mb(dirSize(venvSite))}`)
  cpSync(venvSite, destSite, { recursive: true, dereference: true })

  // 打包环境不需要这些。distutils-precedence.pth 指向被删的 _distutils_hack，
  // 留着会让每个 Python 进程启动时打一行错。
  for (const junk of [
    'pip',
    'setuptools',
    'pkg_resources',
    '_distutils_hack',
    'distutils-precedence.pth',
  ]) {
    rmSync(join(destSite, junk), { recursive: true, force: true })
  }

  log(`python 运行时就绪: ${mb(dirSize(dest))}`)
}

// ---------------------------------------------------------------- 代码

function prepareCode() {
  // 三件套 + 上游推理文件
  const pyFiles = [
    'svc_stems.py',
    'svc_karaoke.py',
    'svc_dereverb.py',
    'svc_common.py',
    'inference.py',
    'ensemble.py',
  ]
  for (const f of pyFiles) {
    const src = join(repoRoot, f)
    if (!existsSync(src)) throw new Error(`缺少 ${f}`)
    cpSync(src, join(runtimeDir, f))
  }

  // utils/ 只带 .py
  const utilsSrc = join(repoRoot, 'utils')
  const utilsDst = join(runtimeDir, 'utils')
  rmSync(utilsDst, { recursive: true, force: true })
  mkdirSync(utilsDst, { recursive: true })
  for (const f of readdirSync(utilsSrc)) {
    if (f.endsWith('.py')) cpSync(join(utilsSrc, f), join(utilsDst, f))
  }

  // web/：后端 + 前端构建产物
  const webServerDst = join(runtimeDir, 'web', 'server')
  rmSync(join(runtimeDir, 'web'), { recursive: true, force: true })
  mkdirSync(webServerDst, { recursive: true })
  cpSync(join(webDir, 'server', 'app.py'), join(webServerDst, 'app.py'))

  const distSrc = join(webDir, 'dist')
  if (!existsSync(distSrc)) {
    throw new Error('web/dist 不存在，先跑 pnpm build')
  }
  cpSync(distSrc, join(runtimeDir, 'web', 'dist'), { recursive: true })

  log(`代码就绪: ${mb(dirSize(join(runtimeDir, 'web')))}`)
}

// ---------------------------------------------------------------- 模型

function prepareModels() {
  const dest = join(runtimeDir, 'models')
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })

  const srcDir = join(repoRoot, 'models')
  let weights = 0
  let structs = 0

  // models/ 里有三类东西，缺一不可：
  //   *.ckpt 权重（大头）
  //   *.yaml 结构定义
  //   *.py   模型实现（inference.py 会 import models.bs_roformer 等）
  // 还有 bandit/ scnet_unofficial/ 等子目录里的一堆 .py。
  const copyTree = (src, dst) => {
    for (const entry of readdirSync(src, { withFileTypes: true })) {
      const s = join(src, entry.name)
      const d = join(dst, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === '__pycache__') continue
        mkdirSync(d, { recursive: true })
        copyTree(s, d)
        continue
      }
      if (entry.name.endsWith('.ckpt')) {
        cpSync(s, d)
        weights += 1
      } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.py')) {
        cpSync(s, d)
        if (entry.name.endsWith('.yaml')) structs += 1
      }
    }
  }

  copyTree(srcDir, dest)
  log(`模型就绪: ${weights} 个权重, ${structs} 个结构定义, ${mb(dirSize(dest))}`)
}

// ---------------------------------------------------------------- ffmpeg

function prepareFfmpeg() {
  const dest = join(runtimeDir, 'bin')
  mkdirSync(dest, { recursive: true })

  let src = process.env.VS_FFMPEG
  if (!src) {
    try {
      src = execFileSync(
        join(repoRoot, '.venv', 'Scripts', 'python.exe'),
        ['-c', 'import svc_common;print(svc_common.FFMPEG)'],
        { cwd: repoRoot, encoding: 'utf8' },
      ).trim()
    } catch {
      /* 下面统一报错 */
    }
  }

  if (!src || !existsSync(src)) {
    throw new Error('找不到 ffmpeg.exe（试过 VS_FFMPEG 和 svc_common.FFMPEG）')
  }

  const target = join(dest, 'ffmpeg.exe')
  cpSync(src, target)
  log(`ffmpeg 就绪: ${mb(dirSize(target))}`)
}

// ---------------------------------------------------------------- 自检

/** 装完立刻跑一遍，别等打包装出来才发现缺东西。 */
function selfCheck() {
  const py = join(runtimeDir, 'python', 'python.exe')
  log('自检：独立 Python 能否导入 torch')
  const out = execFileSync(py, ['-c', 'import torch,librosa,soundfile;print(torch.__version__)'], {
    encoding: 'utf8',
    timeout: 180000,
  })
  log(`  torch ${out.trim()}`)

  log('自检：backend 能否加载')
  execFileSync(
    py,
    ['-c', 'import sys;sys.path.insert(0,".");import svc_common;print(svc_common.MSST)'],
    {
      cwd: runtimeDir,
      encoding: 'utf8',
      timeout: 60000,
    },
  )
  log('  自检通过')
}

// ---------------------------------------------------------------- main
//
// 每个 prepare* 自己清理自己的子目录。不要在这里整体 rmSync(runtimeDir)：
// --skip-python 时会先把已就绪的 python/ 删掉再跳过重建，留下半成品。

mkdirSync(runtimeDir, { recursive: true })

try {
  if (!skipPython) preparePython()
  prepareCode()
  if (!skipModels) prepareModels()
  prepareFfmpeg()

  writeFileSync(
    join(runtimeDir, 'BUILD_INFO.txt'),
    [
      'vocal-stems desktop runtime',
      `built: ${new Date().toISOString()}`,
      `python: ${skipPython ? 'skipped' : 'standalone CPython 3.11'}`,
      '',
    ].join('\n'),
    'utf8',
  )

  if (!skipPython) selfCheck()

  log(`全部就绪 → ${runtimeDir}`)
  log(`总大小: ${mb(dirSize(runtimeDir))}`)
} catch (err) {
  console.error(`[runtime] 失败: ${err.message}`)
  process.exit(1)
}
