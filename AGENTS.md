# AGENTS.md — vocal-stems

给在本仓库里改代码的 agent 看的现场说明。先读这份，再动手。

## 1. 这是什么

ZFTurbo/MSST(Music-Source-Separation-Training)的本地改造版：训练/推理框架保持上游 MIT 代码，本地新增了**三条干声分离脚本**（SVC 三件套）和**融合算法修正**，并针对 RTX 3070 8GB 做过裁剪。

两条完全独立的链路，别混：

| 链路 | 入口 | 用途 | 是否本地原创 |
|---|---|---|---|
| 干声分离（实际在用） | `svc_stems.py` / `svc_karaoke.py` / `svc_dereverb.py` + `svc_common.py` | 拖拽或命令行出人声/伴奏/主唱/和声/去混响 | 是，PolyForm Strict |
| 上游训练框架 | `train.py` / `train_ddp.py` / `train_accelerate.py` / `valid.py` / `inference.py` / `ensemble.py` | 训练、验证、单模型推理、融合 | 否，MIT，只在两处有本地补丁 |

`inference.py` / `ensemble.py` 是上游文件，但被本地**改过**（见 §5）。改它们前先确认改的是本地补丁还是上游逻辑。

## 2. 环境（已实测）

- 工作区：`E:\Project-hub\vocal-stems`（git 分支 `master`，远端 `github.com/kurumi1ksllq/vocal-stems`）。
- Python：`.venv\Scripts\python.exe`（3.11.15，uv 建的 venv，**venv 里没有 pip**；装包用 `uv pip install --python .venv\Scripts\python.exe ...`）。
- torch 2.7.1+cu118，CUDA 可用；GPU 是 RTX 3070 8GB。
- 关键依赖实测版本：numpy **1.26.4**、librosa 0.11.0、soundfile 0.14.0、ml-collections 1.1.0、omegaconf 2.3.1、einops 0.8.2、rotary-embedding-torch 0.9.1。`pyproject.toml` 已把 numpy 约束改成 `>=1.24` 与实际环境对齐，不要按 numpy 2.x 的 API 写代码。
- **没有 pytest、没有 CI**。`tests/` 是上游的“配置自检”脚本，不是单测套件。
- `gui/gui-wx.py` 跑不了：wxPython 未安装，且该脚本不在根目录（上游 docs 写的是 `python gui-wx.py`，路径已过期）。

### ffmpeg 是硬编码的绝对路径

`svc_common.py:32`:

```python
FFMPEG = r"C:\Users\admin\ffmpeg\ffmpeg-master-latest-win64-gpl\bin\ffmpeg.exe"
```

这台机器上存在；换机/换用户名就会全线失败（响度规范化、截断、mp3 导出都靠它）。改动机器时这是第一处要改的地方。

### 模型权重不入库

`models/` 里 5 个 `*_fp16.ckpt` 共约 1.5 GB，被 `.gitignore` 忽略（`*.ckpt`/`*.pth`/`*.onnx`）。`models/` 下的 `*.yaml` 是结构定义，**要入库**。当前本机已有的 5 个权重：

| 脚本 | `models/` 下权重 |
|---|---|
| `svc_stems.py` | `model_melband_kj_fp16.ckpt`、`mel_band_roformer_vocals_gabox_fp16.ckpt` |
| `svc_karaoke.py` | `karaoke_bs_roformer_anvuew_fp16.ckpt`、`mel_band_roformer_karaoke_gabox_fp16.ckpt` |
| `svc_dereverb.py` | `dereverb_bs_roformer_anvuew_sdr_22.5050_fp16.ckpt` |

## 3. 三件套怎么跑

```bash
.venv/Scripts/python.exe svc_stems.py     整曲.wav              # 人声(含和声) + 伴奏
.venv/Scripts/python.exe svc_karaoke.py   人声.wav              # 纯主唱 + 和声
.venv/Scripts/python.exe svc_dereverb.py  纯主唱.wav            # 干声 + 混响成分

# 级联（输入给整曲）
.venv/Scripts/python.exe svc_karaoke.py   整曲.wav --from-mix
.venv/Scripts/python.exe svc_dereverb.py  整曲.wav --from-vocals
.venv/Scripts/python.exe svc_dereverb.py  整曲.wav --from-karaoke
```

- 输入既可以是**单个文件**也可以是**目录**（`svc_common.list_dir_input`，扩展名白名单 `AUDIO_EXT`）。
- 公共参数：`--out`（默认 `<项目>/分离输出`）、`--bigshifts`（默认 1）、`--parallel`（默认 2）、`--no-mp3`、`--no-ensemble`、`--fuse`。
- 输出目录 `<项目>/分离输出/<时间戳>_<文件名>_<标签>/`，wav 平铺 + `mp3_试听/` 子目录。以 `_` 开头的中间文件（`_prep_input.wav`、`_in/`、`_in_vocals/`）不算交付物。
- 单文件失败只打印 `[失败]`，不中断目录里的其他文件，退出码仍为 0。批量跑完要看日志里的 `[失败]` 行。

### 拖拽 bat

`svc_去伴奏_拖拽.bat` / `svc_去和声_拖拽.bat` / `svc_去混响_拖拽.bat` / `分离干声_拖拽.bat`。

四个 bat 全部用 `%~dp0` 定位仓库根，**不含任何绝对路径**，换目录/换机器/改仓库名都不用动。约定：

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

## 6. Web 前端（`web/`）

React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui（源码形式）+ FastAPI 后端。
**它不实现任何分离逻辑**，只是 `subprocess` 调 `svc_*.py` 并展示产物。

```bash
cd web
pnpm server   # 后端 :8765（scripts/run-server.mjs 自动找 .venv）
pnpm dev      # 前端 :5178，/api 代理到 8765
pnpm build    # 产物进 web/dist/，之后 pnpm server 单进程托管
```

依赖装在**项目 .venv** 里（`uv pip install --python .venv\Scripts\python.exe fastapi "uvicorn[standard]" python-multipart`），
不是系统 Python。

### 四个必须知道的坑

1. **`ROOT` 不能算成 `web/`。** `app.py` 里是三级：`SERVER_DIR`(web/server) → `WEB_DIR`(web) → `ROOT`(仓库根)。算错会得到 `venvReady=false`、`weights=[]`，产物写进 `web/分离输出/`。
2. **产物目录按 job_id 认领。** `svc_*.py` 用 `<时间戳>_<输入文件名>_<标签>` 命名，上传文件叫 `<job_id>.wav`，所以目录名必含 job_id。按「开始后最新目录」找会在并发时串目录。
3. **`svc_*.py` 单文件失败仍返回 0。** 后端在退出码 0 时还要扫日志里的 `[失败]`，否则失败任务会被标成「已完成」。
4. **根 `.gitignore` 的 `lib/` 和 `Scripts/` 会误伤前端。** `web/.gitignore` 末尾用 `!src/lib/**`、`!scripts/**` 收回。新增前端目录时注意这个坑。

### 前端约定

- Tailwind v4 **没有 `tailwind.config.ts`**，主题全在 `src/index.css` 的 `@theme inline` 里。
- `src/lib/modes.tsx` 必须是 `.tsx`（含 JSX）。
- 同一时刻只允许一条轨播放，`StemPlayer` 受控于父组件 `playingUrl`。
- 日志走 SSE（`/api/jobs/{id}/stream`），不要改回轮询。
- 任务表只在内存，后端重启后清空；产物在 `分离输出/`，产物库仍能看到。

### 代码规范：Biome 2（没有 ESLint / Prettier）

```bash
cd web && pnpm check        # 只检查（CI / 提交前）
pnpm check:fix              # 检查 + 自动修复（格式化、import 排序、安全修复）
pnpm verify                 # biome check + tsc -b
```

- 配置在 `web/biome.json`。缩进 2 空格、行宽 100、LF、单引号、无分号、trailing comma。
- **import 排序由 `assist.source.organizeImports` 负责**，`check --write` 时才生效；`biome lint` 不会排序。
- `server/**` 被排除在格式化/Lint 之外（那是 Python），`src/components/ui/**` 放宽了 a11y 和 `any`（shadcn 原样代码）。
- `noExplicitAny`、`useExhaustiveDependencies` 是 warn 级：后者对“用 state 当 effect 触发信号”的写法会误报，`log-stream.tsx` 里已用 `biome-ignore` 标注原因。
- **改完前端必须跑 `pnpm verify`**，Biome 只查风格和明显缺陷，类型错误靠 `tsc -b` 兜。

### `pnpm-workspace.yaml` 不能删

它不是 workspace（`packages` 只有 `"."`），而是 **pnpm v11 的配置落点**：v11 起不再读 `package.json` 的 `pnpm` 字段，`onlyBuiltDependencies` 等旧键也已废弃。当前内容是：

```yaml
packages:
  - "."

allowBuilds:
  esbuild: true
```

esbuild 是 vite 的构建依赖，必须允许它跑 postinstall，否则每次 `pnpm <命令>` 都报 `ERR_PNPM_IGNORED_BUILDS`。注意 Biome 会格式化这个 yaml，`- "."` 必须保持双引号（`biome check` 会把它从单引号改回来）。

## 7. 测试与验证

没有自动化测试。改完按这个顺序验：

1. 语法/参数：`.venv/Scripts/python.exe svc_stems.py --help`（三个脚本都应有完整 options 输出）。
2. 冒烟：拿 `test_input/When_You_Wish_Upon_a_Star.mp3` 跑一遍，检查输出目录里需要的 stem 是否齐全（`collect_inference` 会校验 `need`，缺了会抛 `RuntimeError`）。
3. 融合：单独跑 `.venv/Scripts/python.exe ensemble.py --files a.wav b.wav --type mag_median_fft --output out.wav`，听/测高频段是否被削。
4. 训练链路回退验证用 `tests/admin_test.py`（配置加载/权重匹配的粗检），但它依赖数据集路径，通常跑不通，别把它当回归测试。

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
