#!/usr/bin/env python
# -*- coding: utf-8 -*-
# SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
# Copyright (c) 2026 kurumi1ksllq
# PolyForm Strict 1.0.0: 允许阅读与个人非商业实验, 禁止分发/修改/商用。
# 完整条款见仓库根目录 LICENSE。本文件为原创, 不受上游 MIT 约束。

"""
svc_dereverb.py — ③ 去混响(noreverb / reverb)

用 anvuew 的 BS-RoFormer dereverb 模型(单目标 noreverb)去掉人声里的混响。
输出:
    noreverb.wav  去混响后的人声
    reverb.wav    被去掉的混响成分(原声 - noreverb)

输入建议给「纯主唱」或「人声干声」。也可以:
    python svc_dereverb.py 人声.wav
    python svc_dereverb.py 人声目录/
    python svc_dereverb.py 整曲.mp3 --from-vocals      先跑去伴奏取人声再去混响
    python svc_dereverb.py 整曲.mp3 --from-karaoke     先跑去伴奏再去和声(取纯主唱)再去混响

输出目录(<项目>/分离输出/<时间戳>_<文件名>_去混响/):
    03_去混响_<文件名>.wav         (= noreverb)
    03_混响成分_<文件名>.wav        (= reverb)
    mp3_试听/

用法:
    python svc_dereverb.py <人声文件或目录> [--bigshifts 1] [--out 输出根目录] [--no-mp3]
"""
import argparse
import os
import shutil
import sys

import svc_common as C

STEP = dict(
    model_type="bs_roformer",
    cfg="config_dereverb_bs_roformer_anvuew.yaml",
    ckpt="dereverb_bs_roformer_anvuew_sdr_22.5050_fp16.ckpt",
    sub="step3_dereverb",
    short="anvuew_dereverb",
    need=("noreverb",),
)


def run_dereverb(src, args):
    name = os.path.basename(src)
    C.say(f"\n{'=' * 60}\n[去混响] {name}")
    out_dir = C.make_out_dir(src, "去混响")
    C.say(f"输出目录: {out_dir}\n")

    prep = os.path.join(out_dir, "_prep_input.wav")
    C.say("[1/2] 输入响度规范化…")
    C.prepare_input(src, prep)

    C.say("[2/2] 去混响推理…")
    in_dir = os.path.join(out_dir, "_in")
    os.makedirs(in_dir, exist_ok=True)
    shutil.copy2(prep, os.path.join(in_dir, "vocals.wav"))
    stems = C.run_inference_parallel([STEP], in_dir, out_dir)[STEP["short"]]

    dry = os.path.join(out_dir, f"03_去混响_{os.path.splitext(name)[0]}.wav")
    shutil.copy2(stems["noreverb"], dry)
    C.say(f"  去混响 → {os.path.basename(dry)}")

    # 混响成分 = 输入 - noreverb(两个都是 44.1k float32 立体声,长度已对齐)
    import soundfile as sf
    import numpy as np
    a, sr = sf.read(prep, always_2d=True, dtype="float32")
    b, _ = sf.read(dry, always_2d=True, dtype="float32")
    n = min(len(a), len(b))
    reverb = a[:n] - b[:n]
    wet = os.path.join(out_dir, f"03_混响成分_{os.path.splitext(name)[0]}.wav")
    sf.write(wet, reverb, sr, subtype="FLOAT")
    C.say(f"  混响成分 → {os.path.basename(wet)}")

    if not args.no_mp3:
        mp3_dir = C.export_mp3(out_dir)
        C.say(f"试听 mp3: {mp3_dir}")

    C.say(f"\n完成 → {out_dir}")
    for f in sorted(os.listdir(out_dir)):
        if f.endswith(".wav") and not f.startswith("_"):
            C.say("  " + f)
    return out_dir


def vocals_for(src, mode, args):
    """按 --from-vocals / --from-karaoke 准备输入人声"""
    if mode == "vocals":
        import svc_stems
        C.say(f"\n[前置] 先从整曲分离人声: {os.path.basename(src)}")
        d = svc_stems.process_one(src, args)
        fused = C.pick_fused(d, "01_人声_含和声", len(svc_stems.STEPS))
        if fused is None:
            raise RuntimeError("去伴奏没有产出融合人声")
        C.say(f"[前置] 用人声: {os.path.basename(fused)}")
        return fused

    # from-karaoke:去伴奏 → 去和声 → 取纯主唱
    import svc_stems
    import svc_karaoke
    C.say(f"\n[前置] 先从整曲分离人声: {os.path.basename(src)}")
    d1 = svc_stems.process_one(src, args)
    voc = C.pick_fused(d1, "01_人声_含和声", len(svc_stems.STEPS))
    if voc is None:
        raise RuntimeError("去伴奏没有产出融合人声")

    k_dir = svc_karaoke.run_karaoke(voc, None, args)
    lead = C.pick_fused(k_dir, "08_纯主唱", len(svc_karaoke.STEPS))
    if lead is None:
        raise RuntimeError("去和声没有产出融合纯主唱")
    C.say(f"[前置] 用纯主唱: {os.path.basename(lead)}")
    return lead


def main():
    C.setup_stdout()
    p = argparse.ArgumentParser(description="去混响:去掉人声里的混响成分")
    p.add_argument("input", help="人声文件或目录")
    g = p.add_mutually_exclusive_group()
    g.add_argument("--from-vocals", action="store_true",
                   help="输入是整曲:先跑去伴奏取人声,再去混响")
    g.add_argument("--from-karaoke", action="store_true",
                   help="输入是整曲:去伴奏 → 去和声取纯主唱 → 去混响")
    C.add_common_args(p)
    args = p.parse_args()
    C.apply_common_args(args)

    mode = "vocals" if args.from_vocals else ("karaoke" if args.from_karaoke else None)

    for src in C.list_dir_input(os.path.abspath(args.input)):
        try:
            target = vocals_for(src, mode, args) if mode else src
            run_dereverb(target, args)
        except Exception as e:
            C.say(f"  [失败] {os.path.basename(src)}: {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
