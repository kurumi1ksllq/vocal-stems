# 桌面应用（Electron）

把 Web 版包成一个双击即用的 Windows 应用。**推理仍然全部在 Python 侧**，
Electron 只负责起后端、开窗、退出时清理。

## 快速开始

```bash
cd web

# 开发：热更新（三个进程一起起）
pnpm electron:dev

# 本地验证：用仓库现有 .venv + 已构建的 dist，不开 vite
pnpm build && pnpm electron:start

# 出分发包
pnpm dist        # → release/干声分离台-<version>-x64.zip  (约 4.2 GB)
pnpm dist:dir    # 只出未压缩目录，调试用
```

## 架构

```
干声分离台.exe
  └─ electron/main.cjs          起后端 → 轮询 /api/health → 开窗
       └─ resources/runtime/
            ├─ python/          独立 CPython 3.11 + site-packages（含 torch cu118）
            ├─ web/server/app.py FastAPI 后端
            ├─ web/dist/         前端静态文件
            ├─ svc_*.py          三件套
            ├─ inference.py ensemble.py utils/
            ├─ models/           5 个权重 + 结构定义 + 模型实现
            └─ bin/ffmpeg.exe
```

开发时 `APP_ROOT` 指向仓库根，打包后指向 `resources/runtime`。
**两边目录布局完全一致**，所以 Python 侧不需要知道自己跑在哪。

## 打包体积

| 组件                  | 大小                        |
| --------------------- | --------------------------- |
| Python + torch cu118  | 4.9 GB                      |
| 模型权重（5 个 fp16） | 1.5 GB                      |
| ffmpeg.exe            | 195 MB                      |
| Electron 运行时       | 460 MB                      |
| **合计**              | **6.9 GB**（zip 后 4.2 GB） |

torch 的 CUDA dll 占了 2.7 GB（`torch_cuda.dll` 1.3 GB + `cudnn` 0.56 GB + `cublasLt` 0.52 GB）。
要压到 1.5 GB 以内只能换 CPU-only torch，代价是推理慢 30–50 倍。

## GPU / CPU 回退

启动时后端跑一次 `torch.cuda.is_available()` 并缓存结果：

- **有 GPU** → 正常推理（RTX 3070 上 82 秒/首）
- **无 GPU 或驱动异常** → 自动给所有推理子进程加 `--force_cpu`，
  同时窗口弹出一次提示，说明为什么慢

判定逻辑在 `server/app.py` 的 `force_cpu()`：

```python
def force_cpu() -> bool:
    if os.environ.get("VS_FORCE_CPU", "").strip() in ("1", "true", "yes"):
        return True
    return not cuda_state()["available"]
```

想强制跑 CPU 验证这条链路：设 `VS_FORCE_CPU=1` 再启动。

## 环境变量

打包后由 `main.cjs` 注入，一般不用手动设：

| 变量           | 作用                   | 打包时默认值                       |
| -------------- | ---------------------- | ---------------------------------- |
| `VS_APP_ROOT`  | 覆盖运行目录（调试用） | —                                  |
| `VS_PYTHON`    | 指定解释器             | `runtime/python/python.exe`        |
| `VS_MODELS`    | 权重目录               | `runtime/models`                   |
| `VS_OUT`       | 产物输出目录           | `~/Documents/vocal-stems/分离输出` |
| `VS_FFMPEG`    | ffmpeg 路径            | `runtime/bin/ffmpeg.exe`           |
| `VS_FORCE_CPU` | 强制 CPU 推理          | 未设                               |

`svc_common.py` 里每个路径都能被对应变量覆盖，且**默认行为不变**——
命令行用法完全不受影响。

## 关键实现细节

**1. Electron 主进程必须是 `.cjs`。**
`package.json` 里有 `"type": "module"`，`.js` 会被 Node 按 ESM 加载，
而 Electron 主进程用 `require('electron')`。所以是 `main.cjs` / `preload.cjs`。

**2. venv 不能直接打包。**
`.venv/python.exe` 只是个壳，靠 `pyvenv.cfg` 里的 `home` 指向开发机的
`C:\Users\admin\AppData\Roaming\uv\python\...`。复制走就废。
`prepare-runtime.mjs` 的做法是：复制 uv 的 standalone CPython（自包含），
再把 venv 的 `site-packages` 合并进去。

**3. `models/` 里除了权重还有代码。**
`inference.py` 会 `from models.bs_roformer import BSRoformer`，
所以 `models/*.py` 和子目录必须一起打。只带 `.yaml` 和 `.ckpt` 会在推理时炸
`ModuleNotFoundError: No module named 'models.bs_roformer'`。

**4. 输出目录必须在可写位置。**
装到 Program Files 时 `resources/` 是只读的，所以 `VS_OUT` 指向
`~/Documents/vocal-stems/分离输出`，并在启动时 `mkdir -p`。

**5. 退出要杀进程树。**
`inference.py` 是 `svc_*.py` 的子进程，只 kill 父进程会留下孤儿。
`stopBackend()` 在 Windows 用 `taskkill /pid <pid> /T /F`。

**6. NSIS 打不了，只能用 zip。**
NSIS 3 是 32 位程序，单个文件 mmap 上限约 2GB，而 7z 压缩包有 3.3 GB，
会报 `failed creating mmap`。所以 `win.target` 是 `zip`，不是 `nsis`。
要出安装包得先裁体积（换 CPU-only torch）。

## 已验证

在**换目录解压**的情况下（模拟另一台机器）跑通：

| 检查                                      | 结果                                   |
| ----------------------------------------- | -------------------------------------- |
| 从 zip 解压到 `%TEMP%` 后启动             | ✅ 窗口正常                            |
| 后端用 `resources/runtime/python` 起来    | ✅                                     |
| `/api/health` 权重 5 个、ffmpeg 就绪      | ✅                                     |
| 真实推理（去混响，100 秒素材）            | ✅ 91 秒完成，产物 3 个 wav + 3 个 mp3 |
| 关闭窗口后 Python 无残留                  | ✅                                     |
| 强杀主进程后 Python 无残留                | ✅                                     |
| `VS_FORCE_CPU=1` 时子进程带 `--force_cpu` | ✅                                     |

## 未做

- **代码签名**：没证书，Windows 会弹 SmartScreen 警告
- **应用图标**：用的 Electron 默认图标
- **自动更新**：没接 electron-updater
- **首次启动引导**：没有下载权重/检测驱动的向导（权重已内置）
