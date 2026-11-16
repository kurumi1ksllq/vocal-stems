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

/** 可写的产物目录。装到 Program Files 时 resources 只读，所以放用户目录。 */
function resolveOutRoot(): string {
  if (env.VS_OUT) return path.resolve(env.VS_OUT)
  return path.join(app.getPath('documents'), 'vocal-stems', '分离输出')
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

function resolveFfmpeg(appRoot: string): string | null {
  return firstExisting([
    env.VS_FFMPEG,
    // 打包后的运行时
    path.join(appRoot, 'bin', 'ffmpeg.exe'),
    path.join(appRoot, 'bin', 'ffmpeg'),
    // 本机历史路径（svc_common.py 里的硬编码兜底，保持一致）
    'C:\\Users\\admin\\ffmpeg\\ffmpeg-master-latest-win64-gpl\\bin\\ffmpeg.exe',
    // PATH 里的
    ...whichAll(),
  ])
}

/** 在 PATH 里找 ffmpeg。找不到就返回空数组。 */
function whichAll(): string[] {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : ['']
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)
  const out: string[] = []
  for (const d of dirs) {
    for (const e of exts) {
      out.push(path.join(d, `ffmpeg${e}`))
    }
  }
  return out
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
  const ffmpeg = resolveFfmpeg(appRoot)

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
