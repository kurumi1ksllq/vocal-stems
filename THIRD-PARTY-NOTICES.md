<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0 -->

# 第三方归属声明 / Third-Party Notices

本文件**不是**本仓库的许可选项。本仓库整体只以
[PolyForm Strict 1.0.0](LICENSE) 提供。此处仅记录本仓库中部分代码的
上游来源，以履行业内通行的署名义务。

## ZFTurbo / Music-Source-Separation-Training

`configs/`、`models/`、`utils/`、`train*.py`、`valid*.py`、`inference.py`、
`ensemble.py` 等文件的原始版本来自：

- 项目: https://github.com/ZFTurbo/Music-Source-Separation-Training
- 作者: Roman Solovyev (ZFTurbo)
- 原许可: MIT

上游原作者的 MIT 授权针对**其自行发布的原始代码**不可撤销，该授权对上游
原始代码继续有效，与本仓库的选择无关。本仓库发布的**本版本整体**（含全部
本地改造、新增目录与新增文件）则以 PolyForm Strict 1.0.0 提供。二者的区别见
[LICENSE](LICENSE) 开头的「关于派生自上游的文件」一段。

以下为上游 MIT 许可原文：

```
MIT License

Copyright (c) 2024 Roman Solovyev (ZFTurbo)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 其他上游与素材

- [lucidrains/BS-RoFormer](https://github.com/lucidrains/BS-RoFormer) — RoFormer 架构
- 模型权重作者: KimberleyJensen / anvuew / aufr33 / viperx / gabox 等
  （权重文件不入库，见 `.gitignore` 与 [README.md](README.md) 对应章节）
- `gui/` 下的 Poppins 字体与图标素材沿用上游仓库中的版权归属
