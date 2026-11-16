# AGENTS.md — vocal-stems

给在本仓库里改代码的 agent 看的现场说明。先读这份，再动手。

## 1. 这是什么

ZFTurbo/MSST(Music-Source-Separation-Training)的本地改造版：训练/推理框架保持上游 MIT 代码，本地新增了**三条干声分离脚本**（SVC 三件套）和**融合算法修正**，并针对 RTX 3070 8GB 做过裁剪。

两条完全独立的链路，别混：

| 链路 | 入口 | 用途 | 是否本地原创 |
|---|---|---|---|
| 干声分离（实际在用） | `svc/svc_stems.py` / `svc/svc_karaoke.py` / `svc/svc_dereverb.py` + `svc/svc_common.py` | 拖拽或命令行出人声/伴奏/主唱/和声/去混响 | 是，PolyForm Strict |
| 上游训练框架 | `train.py` / `train_ddp.py` / `train_accelerate.py` / `valid.py` / `inference.py` / `ensemble.py` | 训练、验证、单模型推理、融合 | 否，MIT，只在两处有本地补丁 |

`inference.py` / `ensemble.py` 是上游文件，但被本地**改过**（见 §5）。改它们前先确认改的是本地补丁还是上游逻辑。

## 2. 环境（已实测）

- 工作区：`E:\Project-hub\vocal-stems`（git 分支 `master`，远端 `github.com/kurumi1ksllq/vocal-stems`）。
- Python：`.venv\Scripts\python.exe`（3.11.15，uv 建的 venv，**venv 里没有 pip**；装包用 `uv pip install --python .venv\Scripts\python.exe ...`）。
- torch 2.7.1+cu118，CUDA 可用；GPU 是 RTX 3070 8GB。
- 关键依赖实测版本：numpy **1.26.4**、librosa 0.11.0、soundfile 0.14.0、ml-collections 1.1.0、omegaconf 2.3.1、einops 0.8.2、rotary-embedding-torch 0.9.1。`pyproject.toml` 已把 numpy 约束改成 `>=1.24` 与实际环境对齐，不要按 numpy 2.x 的 API 写代码。
- **没有 pytest、没有 CI**。`tests/` 是上游的“配置自检”脚本，不是单测套件。
- `gui/gui-wx.py` 跑不了：wxPython 未安装，且该脚本不在根目录（上游 docs 写的是 `python gui-wx.py`，路径已过期）。

### ffmpeg 查找顺序

`svc/svc_common.py` 里按三级回退：

```python
_bundled = os.path.join(MSST, "bin", "ffmpeg.exe")      # ① 仓库/运行时里捆绑的
FFMPEG = os.environ.get("VS_FFMPEG") or (
    _bundled if os.path.exists(_bundled)
    else r"C:\Users\admin\ffmpeg\...\bin\ffmpeg.exe"    # ② 本机硬编码兜底
)
```

`bin/ffmpeg.exe` 现在还不存在（打包时才由 `prepare-runtime.mjs` 放进去），所以日常走硬编码那条。
换机器时优先设 `VS_FFMPEG`，别去改硬编码。

### 模型权重不入库

`models/` 里 5 个 `*_fp16.ckpt` 共约 1.5 GB，被 `.gitignore` 忽略（`*.ckpt`/`*.pth`/`*.onnx`）。`models/` 下的 `*.yaml` 是结构定义，**要入库**。当前本机已有的 5 个权重：

| 脚本 | `models/` 下权重 |
|---|---|
| `svc/svc_stems.py` | `model_melband_kj_fp16.ckpt`、`mel_band_roformer_vocals_gabox_fp16.ckpt` |
| `svc/svc_karaoke.py` | `karaoke_bs_roformer_anvuew_fp16.ckpt`、`mel_band_roformer_karaoke_gabox_fp16.ckpt` |
| `svc/svc_dereverb.py` | `dereverb_bs_roformer_anvuew_sdr_22.5050_fp16.ckpt` |

## 3. 三件套怎么跑

```bash
.venv/Scripts/python.exe svc/svc_stems.py     整曲.wav              # 人声(含和声) + 伴奏
.venv/Scripts/python.exe svc/svc_karaoke.py   人声.wav              # 纯主唱 + 和声
.venv/Scripts/python.exe svc/svc_dereverb.py  纯主唱.wav            # 干声 + 混响成分

# 级联（输入给整曲）
.venv/Scripts/python.exe svc/svc_karaoke.py   整曲.wav --from-mix
.venv/Scripts/python.exe svc/svc_dereverb.py  整曲.wav --from-vocals
.venv/Scripts/python.exe svc/svc_dereverb.py  整曲.wav --from-karaoke
```

- 输入既可以是**单个文件**也可以是**目录**（`svc_common.list_dir_input`，扩展名白名单 `AUDIO_EXT`）。
- 公共参数：`--out`（默认 `<项目>/分离输出`）、`--bigshifts`（默认 1）、`--parallel`（默认 2）、`--no-mp3`、`--no-ensemble`、`--fuse`。
- 输出目录 `<项目>/分离输出/<时间戳>_<文件名>_<标签>/`，wav 平铺 + `mp3_试听/` 子目录。以 `_` 开头的中间文件（`_prep_input.wav`、`_in/`、`_in_vocals/`）不算交付物。
- 单文件失败只打印 `[失败]`，不中断目录里的其他文件，退出码仍为 0。批量跑完要看日志里的 `[失败]` 行。

### 拖拽 bat

都在 [`拖拽启动/`](拖拽启动/) 目录：`svc_去伴奏_拖拽.bat` / `svc_去和声_拖拽.bat` / `svc_去混响_拖拽.bat` / `分离干声_单模型_拖拽.bat`。

因为挪进了一层子目录，`ROOT` 不再是 `%~dp0` 而是 `%~dp0..\`（指向仓库根）。除这一行外其余约定不变：

- 编码 **GBK**（`.gitattributes` 规定 `*.bat` 必须 CRLF）。用 UTF-8 重写会让 cmd 里中文全变乱码。
- 第二行必须是 `chcp 936 >nul`。不钉代码页时，`%~dp0` + 中文字面量（如 `%ROOT%分离输出`）在非 936 控制台下会被展开成 U+FFFD 替换符，直接建出 `�������` 这种垃圾目录。
- 改完用 `cmd /c "(echo.) | 脚本.bat 某个音频"` 验证（`echo.` 用来喂掉末尾的 `pause`），确认输出目录名是正常中文、里面没有 U+FFFD。

## 4. 设计上的硬约束（改前必读）

### 模型组合是实测裁出来的，不是随手写的

- `svc_stems.STEPS` 从 3 → 2：砍掉 viperx ep3005（251.9M 参数 + `num_overlap=4`，单吃 62% 耗时），3 模型相关性 0.997+，2 模型融合与 3 模型只差 3.2%。总耗时约 82s，显存峰值 ~4.0 GB。
- `svc_karaoke.STEPS` 从 4 → 2：留 anvuew(BS-RoFormer) + gabox(Mel-Band RoFormer)，**跨架构互补**是关键；同架构（becruily+anvuew）差异高达 10.09%。耗时 295s → 127s。

加模型前先想清楚：同架构模型犯同样的错，融合补不上。加模型会同时抬高耗时、显存和磁盘。

### 融合算法：别再用旧的 `median_fft` / `avg_fft`

`np.median` 作用在复数上按**实部**排序而非模，偶数个模型时取中间两个的均值会让幅度腰斩（细频段“被抹掉”）。`svc_common.FUSE_MODES` 默认是 `mag_median_fft`（幅度取中位、相位取最响那一路）+ `mag_avg_fft`。旧的 8 种算法行为完全没动，`ensemble.py` 向后兼容。

实测（4 模型，16k–20k 频段能量保持率）：`median_fft` 0.851 → `mag_median_fft` 0.963。

### fp16 权重 ≠ fp16 计算

权重存 fp16 只为省磁盘。`inference.py:228` 有本地补丁 `model = model.float()`，**计算全程 fp32**，所以老卡兼容、SNR 61~70 dB。删掉这行会导致 dtype 不匹配。

### 配置文件的编码陷阱

`utils/settings.py:load_config` 用 `open(config_path, 'r')` **不带 encoding**，Windows 默认 cp936。所以 `models/*.yaml` 必须保持 **ASCII-only**（目前已全部是 0 个非 ASCII 字节）。往 yaml 里写中文注释会在加载时炸。

### 输入规范化

`svc_common.prepare_input` 只做纯增益到 `TARGET_LUFS=-16`、峰值 ≤ -1 dBTP，不动动态，统一 44.1k / float32 / 立体声。失败时静默回退复制原文件并打印提示——不要把它改成强制失败。

`svc_dereverb` 的“混响成分”是 `输入 - noreverb` 的时域相减（同采样率、已对齐长度），相减后不再做响度处理。

## 5. 相对上游的本地补丁清单

只有这几处，其余 `inference.py`/`ensemble.py`/`models/`/`utils/` 都是上游代码：

- `inference.py:61-63` — `--input_folder` 传单个文件也支持（拖拽场景）；上游只吃目录。
- `inference.py:228` — `model.float()` 强制 fp32 推理（fp16 权重）。
- `ensemble.py` — 新增 `magnitude_median_fft` / `magnitude_avg_fft`；`stft`/`istft` 支持任意声道数；`ensemble_files` 内置声道对齐 + 长度对齐（取最短）。
- `models/config_mel_band_roformer_karaoke_gabox_vocals.yaml` — 显式声明 `target_instrument: Vocals`，并把 instruments 收敛为单目标。原因写在文件注释里：原 2-stem 配置 `num_stems=1` 且无 `target_instrument`，demix 会把同一份预测广播到两个 stem，只因为 Windows 大小写不敏感让 `Instrumental`/`instrumental` 撞成同一个文件才“看起来能跑”。

`ensemble.py` 的 `--type` 在 CLI 里没有 `choices` 限制，传错值会一路跑到 `average_waveforms` 返回 `None`。

## 6. Web 桌面版（`web/`）

pnpm monorepo，三条链路：**React 渲染进程 → (IPC) → Node 主进程 Hono → (subprocess) → Python**。
**不实现任何分离逻辑**，只是编排与展示。

```
web/apps/desktop      主进程 + preload + 渲染进程
web/packages/shared   Hono 路由 + Drizzle schema + IPC 契约（类型来源）
web/packages/ui       shadcn 组件 + Ladle 工作台
```

```bash
cd web
pnpm dev             # Vite + Electron 热更新
pnpm build           # tsc + vite
pnpm test            # vitest（34 个用例）
pnpm e2e             # Playwright（先 pnpm dist:dir）
pnpm verify          # biome ci + 三包 typecheck
pnpm prepare:runtime # 组装 runtime/（Python + 权重 + ffmpeg，6.5 GB）
pnpm dist            # release/干声分离台-<v>-x64.zip
```

**没有 HTTP 后端了。** 旧版 FastAPI + uvicorn 已删除，端口也不再监听。

### 数据流

```
window.vs.rpc({method, path, body})      preload 桥，渲染进程唯一出口
  → ipcMain.handle('vs:rpc')             主进程，补 /api 前缀
  → api.request()                        Hono 路由（类型来自 shared/callable）
  → job-runner                           Drizzle + node:sqlite 持久化
  → spawn svc/svc_*.py                   Python sidecar，纯 CLI 不监听端口
```

音频走 `vs-media://local/<encodeURIComponent(absPath)>`，支持 Range。

### 纪律（改代码前必读）

1. **渲染进程不碰 Node** —— 只有 `window.vs`，没有 fs/path/ipcRenderer。
2. **数据库只在主进程** —— `node:sqlite` 的 `DatabaseSync` 不可跨进程传递。
3. **Hono 路由类型放 `shared/callable`** —— 主进程实现，渲染进程只 `import type`。
4. **preload 不 import electron-log** —— 渲染错误经 `reportError` → IPC → 主进程写日志 + 落库。
5. **重活不阻塞主进程** —— PyTorch 在 Python 子进程；任务异步跑，状态进 SQLite。

### 六个必须知道的坑

1. **主进程产物必须是 `.cjs`。** `package.json` 有 `"type": "module"`，`.js` 会被 Electron 当 ESM，`require`/`__dirname` 全炸。
2. **Vite 8 用 rolldown，`rollupOptions.output.format` 不生效。** 要写 `build.lib.formats: ['cjs']` 才真出 CJS。
3. **Hono 不能用自定义 scheme 当 origin。** `new URL(path, 'vs-app://local')` 解析出的 pathname 不对，路由全 404；用 `http://localhost`。
4. **迁移路径要数四层。** `__dirname` 是 `apps/desktop/dist-electron/main`，四层上溯才是 `web/`。
5. **`app.setName('vocal-stems')`。** 否则 userData 会变成 `AppData/Roaming/@vs/desktop`（包名带 scope 和斜杠）。
6. **根 `.gitignore` 曾吞掉整个 `scripts/`。** 上游 `lib/`、`Scripts/` 两条不带前导 `/`，会匹配任意层级；Windows 下 git 还不区分大小写，9 个上游脚本从未入库。现已锚定成 `/lib/` 并删掉 `Scripts/`。**新增顶层目录后跑一次 `git check-ignore -v <file>` 确认。**

### 代码规范：Biome 2（没有 ESLint / Prettier）

```bash
pnpm check       # 只检查
pnpm check:fix   # 检查 + 自动修复（格式化、import 排序）
pnpm verify      # biome ci + typecheck
pnpm test        # vitest
```

- 配置在 `web/biome.json`，**精确锁 2.6.8**。缩进 2 空格、行宽 100、单引号、无分号。
- import 排序由 `assist.source.organizeImports` 负责，`check --write` 时才生效。
- `runtime/`、`release/`、`dist*/`、`drizzle/` 都在 `files.includes` 里排除。
- 测试文件允许 `noExplicitAny`；整体 `noNonNullAssertion` 是 warn（测试里 `xxx!` 难免）。
- **biome ci 会检查格式化**，改了 yaml/md 后要 `pnpm format`。

### `pnpm-workspace.yaml` 不能删

pnpm v11 的配置落点（v11 起不读 `package.json` 的 `pnpm` 字段）。`allowBuilds` 必须放行：
`esbuild`、`electron`、`electron-winstaller`、`lefthook`、`@biomejs/biome`、`@swc/core`、`msw`。
少一个就每次 `pnpm <命令>` 报 `ERR_PNPM_IGNORED_BUILDS`。

另外**脚本名不能叫 `runtime`** —— pnpm 有同名内建子命令会抢走，用 `prepare:runtime`。

## 7. 测试与验证

**Python 侧没有自动化测试**（`tests/` 是上游的配置自检脚本，通常跑不通）。
**前端有**：`web/` 下 34 个 vitest 用例 + 8 个 Playwright E2E。

### Python / 三件套

1. 语法：`.venv/Scripts/python.exe svc/svc_stems.py --help`（三个脚本都要有完整 options）
2. 冒烟：`test_input/When_You_Wish_Upon_a_Star.mp3` 跑一遍，`collect_inference` 会校验 `need`，缺 stem 抛 `RuntimeError`
3. 融合：`ensemble.py --files a.wav b.wav --type mag_median_fft --output out.wav`，测高频段是否被削
4. 训练链路：`tests/admin_test.py`（依赖数据集路径，别当回归测试）

### 前端 / 桌面

```bash
cd web
pnpm verify   # biome ci + 三包 tsc --noEmit
pnpm test     # vitest：路由契约 24 个 + sidecar 进程 10 个
pnpm e2e      # Playwright：6 个快检（起真 Electron，验窗口/preload/RPC）
VS_E2E_REAL_JOB=1 pnpm e2e   # 加 2 个真实推理用例（约 2 分钟）
```

E2E 需要先 `pnpm build && pnpm dist:dir`，它跑的是 `release/win-unpacked` 里的真应用。

**改完前端必须跑 `pnpm verify`** —— Biome 查风格，`tsc` 查类型，两者都不能省。

## 8. 仓库卫生

- `.gitattributes`：文本 LF；**`*.bat` 必须 CRLF**；`* -text` 兜底不转换。
- `.gitignore` 忽略：所有 `*.ckpt`、`分离输出/`、`test_input/`、`test_output/`、`_probe_*`、`results/`、`wandb/`、`*.log`。
- `分离输出/` 里的 `20261115_i will survive_成品交付/` 是**人工整理的交付目录**（`00_原始`/`01_人声总轨`/`02_纯主唱`/`02_和声`/`03_去混响`/`03_混响成分`），不完全是脚本直出的文件名，别拿它当输出格式规范。
- 权限：仓库**双许可**。`svc_*.py`、四个 bat、gabox karaoke 配置、README 的改造章节是 PolyForm Strict（禁止分发/修改/商用之外的用途，见 `LICENSE`）；其余上游派生文件是 MIT（`LICENSES/MIT.txt`）。新增文件要明确归到哪一边，并保留 `# SPDX-License-Identifier` 头。改 `svc_*` 前留意：PolyForm Strict 本身禁止修改，除非是版权持有人本人。

## 9. 常见坑速查

| 现象 | 原因 / 处理 |
|---|---|
| `分离失败 ... ModuleNotFoundError` | 用了系统 python 而非 `.venv\Scripts\python.exe`；`svc_common.start_inference` 会主动 pop `PYTHONPATH`，别指望外部 PYTHONPATH |
| `输出缺失 ...: 缺 ['noreverb']` | 模型没产出目标 stem：检查 config 的 `target_instrument` 与 `need` 是否一致 |
| 融合结果听起来“薄/少了一块” | 用了旧的 `median_fft`/`avg_fft`；换成 `mag_median_fft` |
| 中文注释导致配置加载失败 | `load_config` 以 cp936 读 yaml；改成英文/ASCII 注释 |
| 显存不足 | 降 `PARALLEL`（默认 2，8GB 单模型 <1GB）；`--parallel 1` 最稳 |
| 拖拽 bat 秒退/找不到路径 | 脚本用 `%~dp0` 定位仓库根；若报找不到 `.venv\Scripts\python.exe`，说明仓库目录结构和预期不一样 |
| 输出目录名变成 `�������` | bat 少了 `chcp 936 >nul`，或 bat 被存成 UTF-8。改回 GBK + CRLF 并在第二行钉代码页 |
| mp3 没生成 | ffmpeg 路径不对，或脚本带了 `--no-mp3` |

## 10. 提交约定

- 本仓库是 git 仓库但**不做自动提交**；用户明确说“提交/推”才 commit/push。
- commit 前跑 `git status`，确认没有把 `*.ckpt`、音频或 `分离输出/` 带进去。
- 新增 yaml 结构文件要入库，权重不入库。