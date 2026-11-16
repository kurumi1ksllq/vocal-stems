# Web 桌面版（React + Electron）

干声分离三件套的桌面 UI。**推理全在 Python sidecar**，Electron 只做窗口与业务编排。

> 2026-11 重构：从「FastAPI + HTTP + SSE」改为「Node 主进程 + Hono over IPC + SQLite」。
> 旧的 FastAPI 后端已删除。

## 快速开始

```bash
cd web
pnpm install                 # 首次

pnpm dev                     # Vite dev server + Electron 热更新
pnpm build                   # 只构建（tsc + vite）
pnpm test                    # vitest（34 个用例）
pnpm e2e                     # Playwright（需先 pnpm dist:dir）
pnpm verify                  # biome ci + 三包 typecheck
```

打包：

```bash
pnpm prepare:runtime         # 组装 runtime/（Python + 权重 + ffmpeg，约 6.5 GB）
pnpm dist:dir                # 生成 release/win-unpacked/干声分离台.exe
pnpm dist                    # 生成 release/干声分离台-<version>-x64.zip
```

## 结构

```
web/
├── apps/desktop/            主进程 + preload + 渲染进程
│   ├── src/main/            index.ts（启动）/ job-runner.ts（任务编排）
│   │                        sidecar.ts（Python 进程）/ db.ts / logger.ts
│   │                        media-protocol.ts（vs-media://）
│   ├── src/preload/         IPC 桥（唯一的 Node 边界）
│   ├── src/renderer/        React 19 + TanStack Query + i18next
│   └── test/                vitest（sidecar 进程管理）
├── packages/shared/         Hono 路由 + Drizzle schema + IPC 契约
│   ├── src/callable/        createApp()：主进程实现，渲染进程只取类型
│   ├── src/db/              schema + createDb
│   ├── drizzle/             迁移 SQL（db:generate 产出）
│   └── test/                路由契约测试
├── packages/ui/             shadcn 组件 + Ladle 工作台
├── e2e/                     Playwright
├── scripts/prepare-runtime.mjs
└── runtime/                 打包用的 Python 运行时（不入库）
```

## 数据流

```
渲染进程
  │ window.vs.rpc({method, path, body})    ← preload 桥，只有一个出口
  ▼
主进程（ipcMain.handle('vs:rpc')）
  │ 补 /api 前缀 → api.request()           ← Hono 路由，类型来自 shared/callable
  ▼
job-runner（SidecarApi 实现）
  │ Drizzle + node:sqlite                   ← 任务/产物/日志持久化
  │ spawn Python                            ← svc/svc_*.py
  ▼
Python sidecar（纯 CLI，不监听端口）
```

音频播放：产物经 `vs-media://local/<encodeURIComponent(absPath)>` 暴露，支持 Range。
只允许 `outRoot` 下的路径。

## 纪律（改代码前必读）

1. **渲染进程不碰 Node**。只有 `window.vs`，没有 `fs`/`path`/`ipcRenderer`。
2. **数据库只在主进程**。`node:sqlite` 的 `DatabaseSync` 不可跨进程传递。
3. **Hono 路由类型放 `shared/callable`**。主进程实现，渲染进程只 `import type`。
4. **preload 不 import electron-log**。渲染错误经 `reportError` → IPC → 主进程写日志 + 落库。
5. **i18n 从第一天起**。`src/renderer/i18n.ts`，资源随包，`useSuspense: false`。
6. **Biome 精确锁版本**（2.6.8）。CI 用 `biome ci`。
7. **Drizzle Kit 锁 `1.0.0-beta.24`**（spec 要求 ≥ beta.18）。

## 启动链路

```
app.whenReady()
  ├─ 1. registerMediaScheme()        必须在 ready 前，见 index.ts 顶部
  ├─ 2. openDb(userData, migrations) 迁移从 resources/drizzle 或 web/packages/shared/drizzle
  ├─ 3. createJobRunner(...)         注入 db / 路径 / Python
  ├─ 4. createApp({db, sidecar})     Hono
  ├─ 5. ipcMain.handle('vs:rpc')     唯一的业务 IPC 入口
  ├─ 6. handleMediaProtocol(outRoot)
  └─ 7. createWindow()               hash router，加载 dist/index.html
```

## 打包踩过的坑

| 现象                                        | 原因                                                       | 修法                            |
| ------------------------------------------- | ---------------------------------------------------------- | ------------------------------- |
| `require is not defined in ES module scope` | 主进程产物是 `.js` 而 `package.json` 有 `"type": "module"` | 产物必须叫 `index.cjs`          |
| 主进程打出来仍是 ESM                        | Vite 8 换 rolldown，`rollupOptions.output.format` 不生效   | 用 `build.lib.formats: ['cjs']` |
| `Hono` 路由全 404                           | `new URL(path, 'vs-app://local')` 解析不出 pathname        | origin 用 `http://localhost`    |
| `no such table: jobs`                       | 迁移路径少算一层（`__dirname` 是 `dist-electron/main`）    | 四层上溯到 `web/`               |
| userData 变成 `AppData/Roaming/@vs/desktop` | Electron 用 package name 推导                              | `app.setName('vocal-stems')`    |
| `useToast 必须在 ToasterProvider 内`        | `main.tsx` 漏挂 Provider                                   | 补上                            |

## 已知限制

- 无代码签名，Windows 会弹 SmartScreen
- 默认 Electron 图标
- 没接 electron-updater
- i18n 没有 lint 门禁（spec 要求的 `eslint-plugin-i18next` 是 ESLint 生态，本项目用 Biome）
