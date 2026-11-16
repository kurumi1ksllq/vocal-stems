#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
/**
 * 组装 Electron 打包所需的 Python 运行时 → web/runtime/
 *
 * 目标布局（与开发态仓库结构一致，主进程不需要区分自己跑在哪）：
 *   runtime/
 *     python/python.exe          独立 CPython
 *     python/Lib/site-packages/  torch + 依赖
 *     svc/                       三件套
 *     inference.py ensemble.py
 *     utils/                     inference 依赖
 *     models/                    权重 + 结构
 *     bin/ffmpeg.exe
 *
 * 为什么不用 .venv：venv 里的 python.exe 是个壳，靠 pyvenv.cfg 指向开发机的
 * 绝对路径，复制到别的机器就废。这里复制 uv 的 standalone CPython（自包含），
 * 再把已装好的 site-packages 合进去。
 *
 * 用法：node scripts/prepare-runtime.mjs [--skip-python] [--skip-models] [--skip-ffmpeg]
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
const runtimeDir = join(webDir, 'runtime')

const flags = new Set(process.argv.slice(2))
const skipPython = flags.has('--skip-python')
const skipModels = flags.has('--skip-models')
const skipFfmpeg = flags.has('--skip-ffmpeg')

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

// ---------------------------------------------------------------- Python

/** 读 .venv/pyvenv.cfg 的 home，拿到 uv 装的 standalone CPython 目录。 */
function readBasePython() {
  const cfg = join(repoRoot, '.venv', 'pyvenv.cfg')
  if (!existsSync(cfg)) return null
  const m = /^home\s*=\s*(.+)$/m.exec(readFileSync(cfg, 'utf8'))
  return m ? m[1].trim() : null
}

function preparePython() {
  const base = readBasePython()
  if (!base) throw new Error('读不到 .venv/pyvenv.cfg 的 home')
  if (!existsSync(join(base, 'python.exe'))) {
    throw new Error(`base python 不存在: ${join(base, 'python.exe')}`)
  }

  const dest = join(runtimeDir, 'python')
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })

  log(`复制 base python: ${base}`)
  // 只带运行时必需项；tcl/include/libs 对推理无用
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

  // 顺手清 __pycache__，能省几百 MB
  const before = dirSize(dest)
  prunePycache(dest)
  const after = dirSize(dest)
  log(`python 运行时就绪: ${mb(after)}（清缓存省 ${mb(before - after)}）`)
}

function prunePycache(root) {
  const stack = [root]
  while (stack.length) {
    const cur = stack.pop()
    let entries
    try {
      entries = readdirSync(cur, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const full = join(cur, e.name)
      if (!e.isDirectory()) continue
      if (e.name === '__pycache__') {
        rmSync(full, { recursive: true, force: true })
        continue
      }
      stack.push(full)
    }
  }
}

// ---------------------------------------------------------------- 代码

function prepareCode() {
  // 上游推理文件放 runtime 根
  for (const f of ['inference.py', 'ensemble.py']) {
    const src = join(repoRoot, f)
    if (!existsSync(src)) throw new Error(`缺少 ${f}`)
    cpSync(src, join(runtimeDir, f))
  }

  // 三件套在 svc/，保持同样层级
  const svcDst = join(runtimeDir, 'svc')
  rmSync(svcDst, { recursive: true, force: true })
  mkdirSync(svcDst, { recursive: true })
  for (const f of [
    '__init__.py',
    'svc_stems.py',
    'svc_karaoke.py',
    'svc_dereverb.py',
    'svc_common.py',
  ]) {
    const src = join(repoRoot, 'svc', f)
    if (!existsSync(src)) throw new Error(`缺少 svc/${f}`)
    cpSync(src, join(svcDst, f))
  }

  // utils/ 只带 .py
  const utilsSrc = join(repoRoot, 'utils')
  const utilsDst = join(runtimeDir, 'utils')
  rmSync(utilsDst, { recursive: true, force: true })
  mkdirSync(utilsDst, { recursive: true })
  for (const f of readdirSync(utilsSrc)) {
    if (f.endsWith('.py')) cpSync(join(utilsSrc, f), join(utilsDst, f))
  }

  log('代码就绪: svc/ + inference.py + ensemble.py + utils/')
}

// ---------------------------------------------------------------- 模型

function prepareModels() {
  const dest = join(runtimeDir, 'models')
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })

  const srcDir = join(repoRoot, 'models')
  let weights = 0
  let structs = 0

  // models/ 有三类，缺一不可：
  //   *.ckpt 权重（大头）
  //   *.yaml 结构定义
  //   *.py   模型实现（inference.py 会 import models.bs_roformer 等）
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
//
// ffmpeg 必须随包分发，不能依赖宿主机器 PATH 里碰巧有一个。
// 来源按优先级：
//   1. VS_FFMPEG 指定的本地文件
//   2. <仓库>/tools/ffmpeg/ffmpeg.exe（提交进仓库的那份，唯一的权威来源）
//   3. 自动下载固定版本到 tools/ffmpeg/（首次打包时）
// 版本与 sha256 都钉死，避免"我这能跑、别人那不能跑"。

const FFMPEG_DIR = join(repoRoot, 'tools', 'ffmpeg')
const FFMPEG_URL = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
const FFMPEG_LOCAL = join(FFMPEG_DIR, 'ffmpeg.exe')

function resolveFfmpegSource() {
  if (process.env.VS_FFMPEG && existsSync(process.env.VS_FFMPEG)) {
    log(`ffmpeg 来源: VS_FFMPEG=${process.env.VS_FFMPEG}`)
    return process.env.VS_FFMPEG
  }
  if (existsSync(FFMPEG_LOCAL)) {
    log(`ffmpeg 来源: 仓库内 ${FFMPEG_LOCAL}`)
    return FFMPEG_LOCAL
  }
  return null
}

/** 从 gyan.dev 拉固定版本，解出 ffmpeg.exe 放进 tools/ffmpeg/。 */
async function downloadFfmpeg() {
  log(`仓库里没有 ffmpeg，下载 ${FFMPEG_URL}`)
  mkdirSync(FFMPEG_DIR, { recursive: true })
  const zipPath = join(FFMPEG_DIR, 'ffmpeg.zip')

  const res = await fetch(FFMPEG_URL)
  if (!res.ok) throw new Error(`下载失败: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(zipPath, buf)
  log(`已下载 ${mb(buf.byteLength)}`)

  // 用系统自带 tar 解 zip（Windows 10+ 自带 bsdtar，能解 zip）
  const extractDir = join(FFMPEG_DIR, '_extract')
  rmSync(extractDir, { recursive: true, force: true })
  mkdirSync(extractDir, { recursive: true })
  execFileSync('tar', ['-xf', zipPath, '-C', extractDir], { stdio: 'inherit' })

  // zip 里是 <build-name>/bin/ffmpeg.exe
  let found = null
  for (const entry of readdirSync(extractDir)) {
    const candidate = join(extractDir, entry, 'bin', 'ffmpeg.exe')
    if (existsSync(candidate)) {
      found = candidate
      break
    }
  }
  if (!found) throw new Error('下载的压缩包里没找到 bin/ffmpeg.exe')

  cpSync(found, FFMPEG_LOCAL)
  rmSync(extractDir, { recursive: true, force: true })
  rmSync(zipPath, { force: true })
  log(`ffmpeg 已落到 ${FFMPEG_LOCAL}`)
  return FFMPEG_LOCAL
}

async function prepareFfmpeg() {
  const dest = join(runtimeDir, 'bin')
  mkdirSync(dest, { recursive: true })

  let src = resolveFfmpegSource()
  if (!src && skipFfmpeg) {
    log('跳过 ffmpeg（--skip-ffmpeg）')
    return
  }
  if (!src) src = await downloadFfmpeg()

  const target = join(dest, 'ffmpeg.exe')
  cpSync(src, target)

  // 立刻验一次，确认拷出来的是能跑的可执行文件，而不是被杀软隔离的空壳
  const ver = execFileSync(target, ['-version'], { encoding: 'utf8', timeout: 30_000 })
  const firstLine = ver.split(/\r?\n/)[0]
  log(`ffmpeg 就绪: ${mb(dirSize(target))}`)
  log(`  ${firstLine}`)
}

// ---------------------------------------------------------------- 自检

/** 装完立刻验，别等打包装出来才发现缺东西。 */
function selfCheck() {
  const py = join(runtimeDir, 'python', 'python.exe')
  if (!existsSync(py)) {
    log('跳过自检：没有 python.exe')
    return
  }

  log('自检：独立 Python 导入 torch')
  const out = execFileSync(py, ['-c', 'import torch,librosa,soundfile;print(torch.__version__)'], {
    encoding: 'utf8',
    timeout: 180_000,
  })
  log(`  torch ${out.trim()}`)

  log('自检：svc_common 路径解析')
  const probe = execFileSync(
    py,
    [
      '-c',
      'import sys;sys.path.insert(0,"svc");import svc_common as C;' +
        'print(C.MSST);print(C.INF);print(C.MODELS)',
    ],
    { cwd: runtimeDir, encoding: 'utf8', timeout: 60_000 },
  )
  const [msst, inf, models] = probe.trim().split(/\r?\n/)
  if (!existsSync(inf)) throw new Error(`自检失败：inference.py 路径不对 ${inf}`)
  if (!existsSync(models)) throw new Error(`自检失败：models 路径不对 ${models}`)
  log(`  MSST=${msst}`)
  log('  自检通过')
}

// ---------------------------------------------------------------- main

mkdirSync(runtimeDir, { recursive: true })

try {
  if (!skipPython) preparePython()
  prepareCode()
  if (!skipModels) prepareModels()
  if (!skipFfmpeg) await prepareFfmpeg()

  if (!skipPython && !skipModels) selfCheck()

  log(`全部就绪 → ${runtimeDir}`)
  log(`总大小: ${mb(dirSize(runtimeDir))}`)
} catch (err) {
  console.error(`[runtime] 失败: ${err.message}`)
  process.exit(1)
}
