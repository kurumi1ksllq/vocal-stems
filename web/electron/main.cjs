// Electron 主进程（CommonJS）
//
// 必须是 .cjs：package.json 有 "type": "module"，.js 会被 Node 当 ESM 加载，
// 而 Electron 主进程用 require 更直接。
//
// 职责很窄：起后端 → 等它就绪 → 开窗 → 退出时清理干净。
// 所有分离逻辑仍在 Python 侧，这里不碰。
//
// 两种运行模式：
//   dev  (pnpm electron:dev)  → 用仓库现有 .venv + vite dev server(:5178)
//   prod (打包后)              → 用 resources/app/ 里的独立 runtime 和 dist

const { app, BrowserWindow, dialog, shell, Menu } = require('electron')
const { spawn, execFile } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')

// 判断依据不能只用 app.isPackaged：用 electron 跑未打包目录时它也是 false，
// 但运行资料已经在别处了。有 VS_APP_ROOT 就说明由启动脚本指定了完整运行时。
const forcedRoot = process.env.VS_APP_ROOT

/**
 * APP_ROOT 是「所有运行资料」的根：
 *   开发 → 仓库根（.venv / svc_*.py / models / 分离输出 都在这里）
 *   打包 → resources/runtime（由 prepare-runtime.mjs 组装成同样的布局）
 * 两边结构一致，后端代码不用区分自己在哪。
 */
const APP_ROOT = forcedRoot
  ? path.resolve(forcedRoot)
  : app.isPackaged
    ? path.join(process.resourcesPath, 'runtime')
    : path.resolve(__dirname, '..', '..')

const SERVER_ENTRY = path.join(APP_ROOT, 'web', 'server', 'app.py')

let pyProc = null
let mainWindow = null
let backendPort = 0
let quitting = false

// ---------------------------------------------------------------- 工具

/** 让系统分配一个空闲端口，避免和用户已有的服务撞车。 */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

/** 轮询 /api/health，直到后端真正能应答（torch 导入要几秒）。 */
async function waitForHealth(port, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs
  let lastErr = null
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`)
      if (res.ok) return await res.json()
    } catch (e) {
      lastErr = e
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`后端在 ${timeoutMs / 1000}s 内没有就绪：${lastErr?.message ?? '无响应'}`)
}

/** 找到要用的 Python 解释器。显式 VS_PYTHON 优先级最高（打包/调试都用它）。 */
function resolvePython() {
  if (process.env.VS_PYTHON) return process.env.VS_PYTHON

  const candidates = [
    // 打包后的独立运行时
    path.join(APP_ROOT, 'python', 'python.exe'),
    path.join(APP_ROOT, 'python', 'bin', 'python3'),
    // 开发时的 venv
    path.join(APP_ROOT, '.venv', 'Scripts', 'python.exe'),
    path.join(APP_ROOT, '.venv', 'bin', 'python'),
  ]

  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }

  throw new Error(`找不到 Python 解释器，已尝试：\n${candidates.join('\n')}`)
}

/** 打包后要在运行时里找资源；开发时让 svc_common 用它的默认值。 */
function runtimeEnv() {
  if (!app.isPackaged && !forcedRoot) {
    // 开发模式只透传显式覆盖，方便手工验证打包路径逻辑
    const passthrough = {}
    for (const k of ['VS_FFMPEG', 'VS_MODELS', 'VS_OUT', 'VS_FORCE_CPU']) {
      if (process.env[k]) passthrough[k] = process.env[k]
    }
    return passthrough
  }

  const env = {}

  const ffmpeg = path.join(APP_ROOT, 'bin', 'ffmpeg.exe')
  if (fs.existsSync(ffmpeg)) env.VS_FFMPEG = ffmpeg

  const models = path.join(APP_ROOT, 'models')
  if (fs.existsSync(models)) env.VS_MODELS = models

  // 输出目录必须可写：装到 Program Files 时 resources 是只读的。
  // 默认放「文档」下，用户能找到，也不会因权限失败。
  const outRoot = path.join(os.homedir(), 'Documents', 'vocal-stems', '分离输出')
  fs.mkdirSync(outRoot, { recursive: true })
  env.VS_OUT = outRoot

  return env
}

// ---------------------------------------------------------------- 后端

async function startBackend() {
  const python = resolvePython()
  backendPort = await findFreePort()

  console.log(`[electron] python: ${python}`)
  console.log(`[electron] app root: ${APP_ROOT}`)
  console.log(`[electron] backend port: ${backendPort}`)

  pyProc = spawn(python, ['-u', SERVER_ENTRY, '--port', String(backendPort)], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      ...runtimeEnv(),
      PYTHONIOENCODING: 'utf-8',
      PYTHONUNBUFFERED: '1',
      // 别让外部 PYTHONPATH 干扰
      PYTHONPATH: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  pyProc.stdout.on('data', (d) => process.stdout.write(`[py] ${d}`))
  pyProc.stderr.on('data', (d) => process.stderr.write(`[py] ${d}`))

  pyProc.on('exit', (code, signal) => {
    pyProc = null
    if (quitting) return
    // 后端意外死亡：告诉用户，别让窗口空转
    dialog.showErrorBox(
      '后端已退出',
      `分离服务意外停止（code=${code}, signal=${signal}）。\n请查看日志后重启应用。`,
    )
    app.quit()
  })

  const health = await waitForHealth(backendPort)
  return health
}

/** 结束 Python 进程树 —— inference.py 是子进程，kill 父进程不会带走它。 */
function stopBackend() {
  const pid = pyProc?.pid
  if (!pid) return
  try {
    if (process.platform === 'win32') {
      execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => {})
    } else {
      process.kill(-pid, 'SIGTERM')
    }
  } catch (e) {
    console.error('[electron] 停止后端失败:', e)
  }
  pyProc = null
}

// ---------------------------------------------------------------- 窗口

function createWindow(health) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#0a0c10',
    title: '干声分离台',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    if (health?.cuda?.available === false) warnNoGpu(mainWindow)
  })

  // 外链一律走系统浏览器，不在应用内开新窗
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // 显式给了 VITE_DEV_URL 才走 vite（热更新）；否则一律用后端托管 dist，
  // 这样 `electron:start` 不用另开 vite 也能跑，行为与打包后一致。
  const url = process.env.VITE_DEV_URL
    ? process.env.VITE_DEV_URL
    : `http://127.0.0.1:${backendPort}/`

  void mainWindow.loadURL(url)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/** CPU 回退必须让用户看见，否则只会觉得「这软件怎么这么慢」。 */
function warnNoGpu(win) {
  const { response } = dialog.showMessageBoxSync(win, {
    type: 'warning',
    title: '未检测到可用 GPU',
    message: '当前将使用 CPU 推理，速度会慢很多',
    detail:
      '常见原因：\n' +
      '• 显卡不是 NVIDIA，或驱动版本太旧（需要支持 CUDA 11.8）\n' +
      '• 显卡驱动未正确安装\n\n' +
      'CPU 模式下建议把「并行进程」调成 1，并把 bigshifts 保持为 1。',
    buttons: ['我知道了'],
    defaultId: 0,
  })
  return response
}

// ---------------------------------------------------------------- 生命周期

// 单实例：第二个进程直接退出，聚焦已有窗口
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)

    try {
      const health = await startBackend()
      createWindow(health)
    } catch (err) {
      dialog.showErrorBox('启动失败', String(err?.message ?? err))
      app.quit()
    }
  })
}

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', () => {
  quitting = true
  stopBackend()
})

// 兜底：进程被强杀时也尽量清理
process.on('exit', stopBackend)
process.on('SIGINT', () => {
  stopBackend()
  process.exit(0)
})
