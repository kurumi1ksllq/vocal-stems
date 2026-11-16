# tools/ffmpeg

放随安装包一起分发的 ffmpeg 二进制。

## 为什么需要这个目录

`svc/svc_common.py` 只用两处 ffmpeg，**不再回退到开发机硬编码路径或 PATH**：

| 场景 | 期望位置 |
|---|---|
| 打包后 | `<安装目录>/resources/runtime/bin/ffmpeg.exe` |
| 开发态 | `<仓库>/tools/ffmpeg/ffmpeg.exe` |

找不到就抛带完整路径的错，而不是 `WinError 2`，也不会静默用上系统里版本不明的 ffmpeg。

## 二进制不入库

`ffmpeg.exe` 约 195 MB，超过 GitHub 单文件 100 MB 上限，`.gitignore` 已排除。

`web/scripts/prepare-runtime.mjs` 首次打包时自动下载并落到这里：

```
https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip   # 当前 9.0.2
```

之后每次打包直接复用，不再重复下载。

## 想换版本

```bash
# 用自己准备的 ffmpeg（优先级最高）
VS_FFMPEG=D:\path\to\ffmpeg.exe pnpm prepare:runtime
```

或者直接把目标 exe 覆盖到 `tools/ffmpeg/ffmpeg.exe`，打包脚本认得它。

## 换成别的系统

打包脚本目前写死 `ffmpeg.exe`（Windows）。要出 macOS / Linux 包，改
`prepare-runtime.mjs` 里的 `FFMPEG_URL` 和 `FFMPEG_LOCAL` 两处，并同步
`svc_common.py` 的 `_FFMPEG_CANDIDATES`。
