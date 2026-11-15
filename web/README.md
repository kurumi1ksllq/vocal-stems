# 干声分离台 · Web 前端

给 [vocal-stems](../README.md) 做的本地 Web 界面。拖入音频 → 选模式 → 跑推理 → 试听/下载。

不是独立的分离实现——所有推理仍然走仓库根目录的 `svc_stems.py` / `svc_karaoke.py` / `svc_dereverb.py`，
这个目录只负责把 UI 接到它们上面。

## 快速开始

**一次性安装**（仓库根目录）：

```bash
uv pip install --python .venv\Scripts\python.exe fastapi "uvicorn[standard]" python-multipart
cd web && pnpm install
```

**开发模式**（两个进程，前端热更新）：

```bash
# 终端 1 —— 后端 :8765
pnpm server

# 终端 2 —— 前端 :5178，/api 自动代理到 8765
pnpm dev
```

打开 <http://127.0.0.1:5178>。

**生产模式**（一个进程，后端顺带托管 `dist/`）：

```bash
pnpm build
pnpm server
```

打开 <http://127.0.0.1:8765>。

## 目录

```
web/
├── biome.json             格式化 + Lint + import 排序（Biome 2）
├── server/app.py          FastAPI 后端：调 svc_*.py、收日志、暴露产物
├── scripts/run-server.mjs 用项目 .venv 启动后端，不用记 python 路径
├── src/
│   ├── components/        UI 组件（shadcn/ui 风格，源码进仓库）
│   ├── pages/             三个页面：分离台 / 产物库 / 关于
│   ├── lib/               API 契约、hooks、工具函数
│   └── index.css          Tailwind v4 主题（CSS 变量）
└── dist/                  pnpm build 产物（不入库）
```

## 代码规范

格式化、Lint、import 排序统一用 **Biome 2**，不再装 ESLint / Prettier。

```bash
pnpm check        # 只检查，不改文件（CI 用这个）
pnpm check:fix    # 检查 + 自动修复（format、import 排序、安全修复）
pnpm format       # 只格式化
pnpm lint         # 只跑 Lint
pnpm typecheck    # 只跑 tsc
pnpm verify       # check + typecheck，提交前跑一次
```

`biome.json` 的几个关键设置：

- **缩进 2 空格、行宽 100、LF**，单引号、无分号、trailing comma —— 和现有代码风格一致。
- **import 排序交给 `assist.source.organizeImports`**（不是 Lint 规则），`check --write` 时自动生效。
- `server/**` 下的 Python 文件被排除在格式化/Lint 之外，避免误伤。
- `src/components/ui/**` 放宽了 a11y 和 `any` 规则——这些是从 shadcn 复制的原样代码。

**注意**：`noExplicitAny`、`useExhaustiveDependencies` 是 **warn** 不是 error。前者在 Radix 包装层难免，后者对“用 state 当触发信号”的写法会误报（`log-stream.tsx` 里用 `biome-ignore` 显式说明）。

## 关于 `pnpm-workspace.yaml`

这个文件不是用来做 workspace 的（`packages` 只有 `"."`），它存在是因为 **pnpm v11 把配置从 `package.json` 的 `pnpm` 字段挪到了这里**：

```yaml
packages:
  - "."

allowBuilds:
  esbuild: true
```

`allowBuilds` 是 v11 的新写法，替代了 `onlyBuiltDependencies` / `neverBuiltDependencies` 等旧键。esbuild 是 vite 的构建依赖，必须允许它跑 postinstall，否则每次 `pnpm <任何命令>` 都会报：

```
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@0.25.12
```

**不要删这个文件**，也不要把配置写回 `package.json` 的 `pnpm` 字段——v11 明确不再读它。

## 页面

| 路由       | 作用                                                      |
| ---------- | --------------------------------------------------------- |
| `/`        | 分离台：拖拽 → 选模式 → 高级参数 → 发起 → 实时日志 → 试听 |
| `/library` | 产物库：直接扫 `分离输出/`，重启后端也在                  |
| `/about`   | 流水线与设计说明                                          |

## 后端接口

| 方法 | 路径                    | 说明                                             |
| ---- | ----------------------- | ------------------------------------------------ |
| GET  | `/api/health`           | 环境体检：CUDA / 权重 / ffmpeg                   |
| POST | `/api/jobs`             | 上传音频 + 参数，异步起任务                      |
| GET  | `/api/jobs`             | 任务列表                                         |
| GET  | `/api/jobs/{id}/stream` | **SSE** 实时日志                                 |
| GET  | `/api/jobs/{id}/result` | 扫描产物目录，返回可播放的轨                     |
| POST | `/api/jobs/{id}/cancel` | 终止子进程                                       |
| GET  | `/api/library`          | 历史产物目录                                     |
| GET  | `/api/file?path=`       | 受控音频文件（只允许 `分离输出/` 与 `uploads/`） |
| POST | `/api/reveal`           | 在资源管理器打开产物目录                         |

## 几个实现上的坑

**1. 后端不能放在 `web/server/` 里算仓库根。**
`app.py` 早期版本用 `Path(__file__).parent.parent` 当仓库根，结果指向 `web/`，
导致 `venvReady=false`、`weights=[]`、输出写进 `web/分离输出/`。现在分三级：
`SERVER_DIR → WEB_DIR → ROOT`。

**2. 产物目录要按 job_id 认领。**
`svc_*.py` 用 `<时间戳>_<输入文件名>_<标签>` 命名，上传文件叫 `<job_id>.wav`，
所以目录名里一定带 job_id。早期按「开始时间之后最新的目录」找，并发时会串到别人的目录。

**3. `svc_*.py` 单文件失败仍返回退出码 0。**
它只打印 `[失败]` 然后继续下一个文件。后端在退出码为 0 时还要扫日志里有没有 `[失败]`，
否则会把失败的任务标成「已完成」。

**4. 仓库根 `.gitignore` 有 Python 打包用的 `lib/` 和 `Scripts/` 规则。**
会误伤前端的 `src/lib/` 和 `scripts/`。`web/.gitignore` 末尾用 `!src/lib/**` 收回。

**5. Tailwind v4 用 CSS 变量，没有 `tailwind.config.ts`。**
主题全在 `src/index.css` 的 `@theme inline` 里。别去找 config 文件。

## 已知限制

- 任务表只在内存里，后端重启后「本会话任务」清空（产物还在 `分离输出/`，产物库能看到）。
- 同一时刻只能有一个文件在播：`StemPlayer` 受控于父组件的 `playingUrl`。
- 波形解码用 `AudioContext.decodeAudioData`，超大文件（>100MB wav）解码会明显卡一下。
- 上传文件留在 `web/uploads/`，不自动清理。
