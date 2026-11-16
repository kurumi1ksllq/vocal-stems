// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
/**
 * 主进程入口。
 *
 * 启动顺序（有依赖，不能乱）：
 *   1. registerMediaScheme()   —— 必须在 app ready 之前
 *   2. app.whenReady()
 *   3. 打开数据库 + 跑迁移
 *   4. 装 Hono 路由 + IPC 桥
 *   5. 注册 vs-media 协议处理器
 *   6. 开窗
 */
import fs from 'node:fs'
import path from 'node:path'
import { type CallableType, createApp } from '@vs/shared/callable'
import { IPC, type RendererErrorPayload, type RpcRequest, type RpcResponse } from '@vs/shared/ipc'
import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import { openDb } from './db.ts'
import { env } from './env.ts'
import { createJobRunner } from './job-runner.ts'
import { initLogger, logRendererError, mainLog } from './logger.ts'
import { handleMediaProtocol, registerMediaScheme } from './media-protocol.ts'
import { firstExisting } from './sidecar.ts'

// ---------------------------------------------------------------- 路径推导

/** 仓库根 / 运行时根：两种情况布局一致。 */
function resolveAppRoot(): string {
  if (env.VS_REPO_ROOT) return path.resolve(env.VS_REPO_ROOT)
  return app.isPackaged
    ? path.join(process.resourcesPath, 'runtime')
    : // 开发态：apps/desktop/src/main -> 往上四层到仓库根
      path.resolve(__dirname, '..', '..', '..', '..', '..')
}

/**
 * 可写的产物目录：放在「包旁边」而不是系统文档目录。
 *
 * 打包后 exe 在 <安装目录>\干声分离台.exe，resources 在 <安装目录>\resources。
 * 产物写到 <安装目录>\分离输出，也就是 resources 的同级目录——
 * 整个应用自带输入输出，拷走目录就能搬。
 *
 * 开发态没有"安装目录"这个概念，退回仓库根的 分离输出/（和 CLI 三件套一致）。
 */
function resolveOutRoot(): string {
  if (env.VS_OUT) return path.resolve(env.VS_OUT)
  if (!app.isPackaged) {
    // 开发态：apps/desktop/src/main -> 往上五层是仓库根
    return path.resolve(__dirname, '..', '..', '..', '..', '..', '分离输出')
  }
  // 打包态：exe 所在目录（resources 的父目录）
  return path.join(path.dirname(app.getPath('exe')), '分离输出')
}

function resolveUploadsDir(): string {
  return path.join(app.getPath('userData'), 'uploads')
}

function resolveModelsDir(appRoot: string): string {
  return env.VS_MODELS ? path.resolve(env.VS_MODELS) : path.join(appRoot, 'models')
}

function resolvePython(appRoot: string): string {
  const found = firstExisting([
    path.join(appRoot, 'python', 'python.exe'),
    path.join(appRoot, 'python', 'bin', 'python3'),
    path.join(appRoot, '.venv', 'Scripts', 'python.exe'),
    path.join(appRoot, '.venv', 'bin', 'python'),
  ])
  if (!found) throw new Error(`找不到 Python 解释器（appRoot=${appRoot}）`)
  return found
}

/**
 * ffmpeg 只认包内自带的那份。
 *
 * 以前这里还有「开发机硬编码路径」和「PATH 搜索」两级兜底。那两个兜底
 * 在开发机上总能命中，所以打包出去缺 ffmpeg 也发现不了；等到别人机器上
 * PATH 里恰好有个别的 ffmpeg，就会用错的版本跑出诡异的音频，
 * 排查成本极高。现在只认 <appRoot>/bin/ffmpeg.exe，找不到就明说。
 */
function resolveFfmpeg(appRoot: string): { path: string | null; expected: string } {
  const expected = path.join(appRoot, 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
  const candidates = [env.VS_FFMPEG, expected]
  const found = firstExisting(candidates)
  return { path: found, expected }
}

// ---------------------------------------------------------------- 状态

let mainWindow: BrowserWindow | null = null
let killAllJobs: (() => Promise<void>) | null = null
let closing = false

// 1. 协议必须在 ready 前注册
registerMediaScheme()

// 包名是 @vs/desktop，直接用它会让 userData 变成 AppData/Roaming/@vs/desktop
// 这种怪路径（还带 @ 和斜杠）。显式给个产品名。
app.setName('vocal-stems')

// ---------------------------------------------------------------- 单实例

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void bootstrap()
}

async function bootstrap(): Promise<void> {
  await app.whenReady()

  initLogger(env.VS_LOG_LEVEL)
  Menu.setApplicationMenu(null)

  const appRoot = resolveAppRoot()
  const outRoot = resolveOutRoot()
  const uploadsDir = resolveUploadsDir()
  const modelsDir = resolveModelsDir(appRoot)

  mainLog().info('[boot]', { appRoot, outRoot, modelsDir, packaged: app.isPackaged })

  let python: string
  try {
    python = resolvePython(appRoot)
  } catch (err) {
    mainLog().error('[boot] python not found', err)
    const { dialog } = await import('electron')
    dialog.showErrorBox('启动失败', String(err instanceof Error ? err.message : err))
    app.quit()
    return
  }
  const ffmpegInfo = resolveFfmpeg(appRoot)

  // ffmpeg 是硬依赖：规范化、mp3 导出都靠它。缺了就当场说清楚缺哪个文件，
  // 而不是等用户跑完 90 秒推理才在最后一步炸。
  if (!ffmpegInfo.path) {
    const msg =
      `找不到 ffmpeg。\n\n期望位置：\n${ffmpegInfo.expected}\n\n` +
      `这个文件本该随安装包一起分发。如果是从 zip 解压的，` +
      `检查 resources\\runtime\\bin\\ffmpeg.exe 是否被杀毒软件隔离了。`
    mainLog().error('[boot] ffmpeg missing', { expected: ffmpegInfo.expected })
    const { dialog } = await import('electron')
    dialog.showErrorBox('缺少 ffmpeg', msg)
    app.quit()
    return
  }
  const ffmpeg: string = ffmpegInfo.path

  // 2. 数据库 + 迁移
  //
  // __dirname 在开发态是 apps/desktop/dist-electron/main，往上四层是 web/。
  // 打包后迁移文件由 electron-builder 放到 resources/drizzle。
  const migrations = app.isPackaged
    ? path.join(process.resourcesPath, 'drizzle')
    : path.resolve(__dirname, '..', '..', '..', '..', 'packages', 'shared', 'drizzle')
  mainLog().info('[boot] migrations', { path: migrations, exists: fs.existsSync(migrations) })
  const handle = openDb(app.getPath('userData'), migrations)
  const runner = createJobRunner({
    db: handle.db,
    appRoot,
    outRoot,
    uploadsDir,
    modelsDir,
    python,
    ffmpeg,
    forceCpu: Boolean(env.VS_FORCE_CPU),
    onLog: (jobId, line) => {
      mainWindow?.webContents.send(IPC.JOB_LOG, { jobId, line })
    },
    onState: (jobId, status) => {
      mainWindow?.webContents.send(IPC.JOB_STATE, { jobId, status })
    },
  })
  killAllJobs = () => (runner as unknown as { killAll: () => Promise<void> }).killAll()

  // 收拾上一次异常退出的遗留任务：数据库里的 queued/running 已经没有对应进程，
  // 不处理就会永远显示「处理中」并把「当前任务」永久占住。
  try {
    await (runner as unknown as { reapStale: () => Promise<number> }).reapStale()
  } catch (err) {
    mainLog().error('[reap] failed', err)
  }

  // 3. Hono 路由 + IPC 桥
  const api = createApp({
    db: handle.db,
    sidecar: runner,
    now: () => Date.now(),
    outRoot,
  }) as CallableType

  ipcMain.handle(IPC.RPC, async (_e, req: RpcRequest): Promise<RpcResponse> => {
    try {
      // Hono 的 basePath 是 /api，渲染进程传的是 /health 这种相对路径。
      //
      // origin 必须用 http:// —— 试过 vs-app://local，Hono 解析出来是 404：
      // 非特殊 scheme 在 URL 解析里 path 语义不同（host/path 拆不开）。
      // 这里只是借一个 origin 做路由匹配，没有真实网络请求。
      const path = req.path.startsWith('/api') ? req.path : `/api${req.path}`
      const url = new URL(path, 'http://localhost')
      const res = await api.request(url.toString(), {
        method: req.method,
        headers: req.body === undefined ? undefined : { 'content-type': 'application/json' },
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
      })
      if (!res.ok) {
        let message = `${res.status} ${res.statusText}`
        try {
          const body = (await res.json()) as { message?: string }
          if (body?.message) message = body.message
        } catch {
          /* 非 JSON */
        }
        return { ok: false, error: { message, status: res.status } }
      }
      return { ok: true, data: await res.json() }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      mainLog().error('[rpc]', message)
      return { ok: false, error: { message } }
    }
  })

  ipcMain.on(IPC.REPORT_ERROR, (_e, payload: RendererErrorPayload) => {
    const at = logRendererError(payload)
    try {
      const { db } = handle
      // 动态取表，避免在这里再 import 一次 schema 造成循环
      import('@vs/shared/db/schema').then(({ rendererErrors }) => {
        db.insert(rendererErrors)
          .values({
            message: payload.message,
            stack: payload.stack ?? null,
            componentStack: payload.componentStack ?? null,
            url: payload.url ?? null,
            at,
          })
          .run()
      })
    } catch {
      /* 落库失败不影响日志 */
    }
  })

  ipcMain.handle(IPC.ENV, async () => ({
    platform: process.platform,
    versions: {
      electron: process.versions.electron ?? '0',
      chrome: process.versions.chrome ?? '0',
      node: process.versions.node,
    },
    isPackaged: app.isPackaged,
  }))

  // 4. 媒体协议
  handleMediaProtocol(() => outRoot)

  // 5. 开窗
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('before-quit', () => {
    if (closing) return
    closing = true
    void killAllJobs?.()
    handle.close()
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#05060b',
    title: '干声分离台',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}
