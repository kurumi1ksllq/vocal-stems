#!/usr/bin/env python
# -*- coding: utf-8 -*-
# SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
# Copyright (c) 2026 kurumi1ksllq
# PolyForm Strict 1.0.0: 允许阅读与个人非商业实验, 禁止分发/修改/商用。
# 完整条款见仓库根目录 LICENSE。本文件为原创, 不受上游 MIT 约束。

"""
svc_stems.py — ① 去伴奏(vocals / instrumental 分离)

3 个 vocal 模型并行跑,各自出「人声(含和声)」+「伴奏」,再融合成一份。
输出目录(<项目>/分离输出/<时间戳>_<文件名>_去伴奏/):
    01_人声_含和声_<模型>.wav     每个模型一份
    01_伴奏_<模型>.wav
    01_人声_含和声_融合N模型_avg_fft.wav / _median_fft.wav
    01_伴奏_融合N模型_avg_fft.wav / _median_fft.wav
    mp3_试听/

用法:
    python svc_stems.py <音频文件或目录> [--bigshifts 1] [--parallel 2]
                        [--out 输出根目录] [--no-ensemble] [--no-mp3]
"""
import argparse
import os
import shutil
import sys

import svc_common as C

# (model_type, config, ckpt, 子目录, 短名)
# 2026-11-14: 从 3 模型砍到 2。去掉的是 viperx ep3005 —— 它 251.9M 参数、
# num_overlap=4, 单独就吃掉 62% 的耗时(306s 素材实测 134.8s vs 47.1/35.5s),
# 而三个模型输出彼此相关性 0.997+, 2 模型融合与 3 模型融合只差 3.2%。
# 现在总耗时约 82s, 显存峰值从 ~5.9GB 降到 ~4.0GB。
STEPS = [
    ("mel_band_roformer", "config_melband_kj.yaml",
     "model_melband_kj_fp16.ckpt", "step1_kj", "kj"),
    ("mel_band_roformer", "config_mel_band_roformer_vocals_gabox.yaml",
     "mel_band_roformer_vocals_gabox_fp16.ckpt", "step1_gabox_vocals", "gabox_vocals"),
]


def build_steps():
    out = []
    for model_type, cfg, ckpt, sub, short in STEPS:
        out.append(dict(model_type=model_type, cfg=cfg, ckpt=ckpt,
                        sub=sub, short=short, need=("vocals", "instrumental")))
    return out


def process_one(src, args):
    name = os.path.basename(src)
    C.say(f"\n{'=' * 60}\n[去伴奏] {name}")
    out_dir = C.make_out_dir(src, "去伴奏")
    C.say(f"输出目录: {out_dir}\n")

    prep = os.path.join(out_dir, "_prep_input.wav")
    C.say("[1/3] 输入响度规范化…")
    C.prepare_input(src, prep)

    C.say(f"[2/3] vocals/伴奏 分离 × {len(STEPS)} 模型(并行 {C.PARALLEL})…")
    res = C.run_inference_parallel(build_steps(), prep, out_dir)

    vocal_files, inst_files = {}, {}
    for short, stems in res.items():
        v = os.path.join(out_dir, f"01_人声_含和声_{short}.wav")
        i = os.path.join(out_dir, f"01_伴奏_{short}.wav")
        shutil.copy2(stems["vocals"], v)
        shutil.copy2(stems["instrumental"], i)
        vocal_files[short] = v
        inst_files[short] = i

    C.say("[3/3] 融合…")
    if not args.no_ensemble:
        C.ensemble_files(out_dir, vocal_files, "01_人声_含和声")
        C.ensemble_files(out_dir, inst_files, "01_伴奏")
    else:
        C.say("  已跳过融合(--no-ensemble)")

    if not args.no_mp3:
        mp3_dir = C.export_mp3(out_dir)
        C.say(f"试听 mp3: {mp3_dir}")

    C.say(f"\n完成 → {out_dir}")
    for f in sorted(os.listdir(out_dir)):
        if f.endswith(".wav") and not f.startswith("_"):
            C.say("  " + f)
    return out_dir


def main():
    C.setup_stdout()
    p = argparse.ArgumentParser(description="去伴奏:分离人声(含和声)与伴奏")
    p.add_argument("input", help="音频文件或目录")
    C.add_common_args(p)
    args = p.parse_args()
    C.apply_common_args(args)

    for src in C.list_dir_input(os.path.abspath(args.input)):
        try:
            process_one(src, args)
        except Exception as e:
            C.say(f"  [失败] {os.path.basename(src)}: {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
