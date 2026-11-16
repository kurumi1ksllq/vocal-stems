#!/usr/bin/env python
# -*- coding: utf-8 -*-
# SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
# Copyright (c) 2026 kurumi1ksllq
# PolyForm Strict 1.0.0: 允许阅读与个人非商业实验, 禁止分发/修改/商用。
# 完整条款见仓库根目录 LICENSE。本文件为原创, 不受上游 MIT 约束。

"""
svc_karaoke.py — ② 去和声(纯主唱 / 和声)

4 个 karaoke 模型并行跑,各自出「纯主唱」+「和声(背景人声)」,再融合成一份。

输入要求:人声轨(含和声)。三种给法:
    python svc_karaoke.py 人声.wav                直接给人声文件
    python svc_karaoke.py 人声目录/                目录里每个音频当人声处理
    python svc_karaoke.py 整曲.mp3 --from-mix      先跑去伴奏拿到人声,再自动去和声

输出目录(<项目>/分离输出/<时间戳>_<文件名>_去和声/):
    02_纯主唱_<模型>.wav      03_... / 04_... / 05_... 按模型序号
    0N_和声_<模型>.wav
    08_纯主唱_融合N模型_avg_fft.wav / _median_fft.wav
    mp3_试听/

用法:
    python svc_karaoke.py <人声文件或目录> [--from-mix] [--bigshifts 1]
                          [--parallel 2] [--out 输出根目录] [--no-ensemble] [--no-mp3]
"""
import argparse
import os
import shutil
import sys

# 直接跑脚本时本文件所在目录不在 sys.path,显式补上,
# 这样 `python svc/svc_karaoke.py` 和 `python -m svc.svc_karaoke` 都能用。
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import svc_common as C

# (model_type, config, ckpt, 子目录, 短名, 交付序号)
# 2026-11-14: 权重统一换成 fp16 存储版本(_fp16.ckpt)。
# 注意 inference.py 加载后会 model.float(), 计算全程仍是 fp32, 只是省磁盘。
#
# 2026-11-15: 从 4 模型砍到 2 (anvuew + gabox)。
# 依据: 在"和声很少"和"和声明显"两份素材上各跑留一法/组合法,
# 这对组合与 4 模型融合差异 4.51%(和声明显素材) / 0.74%(和声少素材), 均为最低。
# 关键是跨架构互补: anvuew 是 BS-RoFormer, gabox 是 Mel-Band RoFormer;
# 而 becruily+anvuew 同为 BS-RoFormer, 差异高达 10.09% —— 同架构模型犯同样的错, 融合无法互补。
# 代价: 耗时 295s -> 127s (串行), 磁盘 1067MB -> 533MB。
STEPS = [
    ("bs_roformer", "karaoke_bs_roformer_anvuew.yaml",
     "karaoke_bs_roformer_anvuew_fp16.ckpt", "step2_anvuew", "anvuew", "02"),
    ("mel_band_roformer", "config_mel_band_roformer_karaoke_gabox_vocals.yaml",
     "mel_band_roformer_karaoke_gabox_fp16.ckpt", "step2_gabox_mb", "gabox_mb", "03"),
]


def build_steps():
    return [dict(model_type=m, cfg=c, ckpt=k, sub=s, short=sh, seq=q,
                 need=("vocals", "instrumental"))
            for m, c, k, s, sh, q in STEPS]


def run_karaoke(vocals_path, out_root_hint, args):
    """对单个人声文件跑多模型 + 融合,返回输出目录"""
    name = os.path.basename(vocals_path)
    C.say(f"\n{'=' * 60}\n[去和声] {name}")
    out_dir = C.make_out_dir(vocals_path, "去和声")
    C.say(f"输出目录: {out_dir}\n")

    # 人声输入统一成 44.1k float32 立体声,并保留一份 _prep_input 便于追溯
    prep = os.path.join(out_dir, "_prep_input.wav")
    C.prepare_input(vocals_path, prep)

    in_dir = os.path.join(out_dir, "_in_vocals")
    os.makedirs(in_dir, exist_ok=True)
    shutil.copy2(prep, os.path.join(in_dir, "vocals.wav"))

    C.say(f"[1/2] 纯主唱/和声 分离 × {len(STEPS)} 模型(并行 {C.PARALLEL})…")
    res = C.run_inference_parallel(build_steps(), in_dir, out_dir)

    leads = {}
    for step in build_steps():
        short, seq = step["short"], step["seq"]
        stems = res[short]
        lead = os.path.join(out_dir, f"{seq}_纯主唱_{short}.wav")
        back = os.path.join(out_dir, f"{seq}_和声_{short}.wav")
        shutil.copy2(stems["vocals"], lead)
        shutil.copy2(stems["instrumental"], back)
        leads[short] = lead

    C.say("[2/2] 融合纯主唱…")
    if not args.no_ensemble and len(leads) >= 2:
        C.ensemble_files(out_dir, leads, "08_纯主唱")
    elif args.no_ensemble:
        C.say("  已跳过融合(--no-ensemble)")
    else:
        C.say("  不足 2 个模型输出,跳过融合")

    if not args.no_mp3:
        mp3_dir = C.export_mp3(out_dir)
        C.say(f"试听 mp3: {mp3_dir}")

    C.say(f"\n完成 → {out_dir}")
    for f in sorted(os.listdir(out_dir)):
        if f.endswith(".wav") and not f.startswith("_"):
            C.say("  " + f)
    return out_dir


def vocals_from_mix(src, args):
    """--from-mix:先跑去伴奏,取融合人声(median_fft 优先)当输入"""
    import svc_stems
    C.say(f"\n[前置] 先从整曲分离人声: {os.path.basename(src)}")
    stems_dir = svc_stems.process_one(src, args)
    n = len(svc_stems.STEPS)
    fused = C.pick_fused(stems_dir, "01_人声_含和声", n)
    if fused is None:
        # 融合被 --no-ensemble 跳过时,退回第一份单模型人声
        cands = [p for p in sorted(C.glob.glob(os.path.join(stems_dir, "01_人声_含和声_*.wav")))
                 if "融合" not in os.path.basename(p)]
        if not cands:
            raise RuntimeError("去伴奏没有产出人声,无法继续去和声")
        fused = cands[0]
    C.say(f"[前置] 用人声: {os.path.basename(fused)}")
    return fused


def main():
    C.setup_stdout()
    p = argparse.ArgumentParser(description="去和声:从人声(含和声)中分出纯主唱与和声")
    p.add_argument("input", help="人声文件或目录;配合 --from-mix 可传整曲")
    p.add_argument("--from-mix", action="store_true",
                   help="输入是整曲:先跑去伴奏取人声,再去和声")
    C.add_common_args(p)
    args = p.parse_args()
    C.apply_common_args(args)

    for src in C.list_dir_input(os.path.abspath(args.input)):
        try:
            vocals = vocals_from_mix(src, args) if args.from_mix else src
            run_karaoke(vocals, None, args)
        except Exception as e:
            C.say(f"  [失败] {os.path.basename(src)}: {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
