# -*- coding: utf-8 -*-
"""
svc_common.py — SVC 干声三件套的共用层

被以下三个脚本 import,不单独运行:
    svc_stems.py     去伴奏(vocals / instrumental)
    svc_karaoke.py   去和声(纯主唱 / 和声)
    svc_dereverb.py  去混响(noreverb)

提供:常量、ffmpeg 工具、并行推理、融合、产物归档、mp3 导出。
"""
import glob
import os
import sys
import json
import re
import shutil
import subprocess
import tempfile
import datetime

# ---------------- 路径 / 全局参数 ----------------
MSST = os.path.dirname(os.path.abspath(__file__))
PY = os.path.join(MSST, ".venv", "Scripts", "python.exe")
INF = os.path.join(MSST, "inference.py")
ENS = os.path.join(MSST, "ensemble.py")
MODELS = os.path.join(MSST, "models")
FFMPEG = r"C:\Users\admin\ffmpeg\ffmpeg-master-latest-win64-gpl\bin\ffmpeg.exe"
OUT_ROOT = os.path.join(MSST, "分离输出")

BIGSHIFTS = 1          # 循环平移平均次数(1=最快,2=略好但耗时×2)
PARALLEL = 2           # 同时跑的分离进程数(8GB 显存实测单模型 <1GB,并行 2 稳妥)
TARGET_LUFS = -16.0    # 输入响度规范化目标
SAMPLE_RATE = 44100

# 融合算法默认值。旧版用 median_fft / avg_fft,它们直接对复数运算,
# 偶数个模型时取两个反相复数的均值会让幅度腰斩(细频段听感上「被抹掉」)。
# 新算法把幅度和相位分开: 幅度取统计量,相位取幅度最大那一路。
FUSE_MODES = ("mag_median_fft", "mag_avg_fft")

AUDIO_EXT = (".wav", ".mp3", ".flac", ".m4a", ".aac", ".ogg", ".opus",
             ".wma", ".aiff", ".aif", ".ape", ".mp4", ".mkv", ".mov")


def setup_stdout():
    """只把 errors 改成 replace,不改编码。

    控制台是 cp936 时就必须按 cp936 输出;强行改成 utf-8 会让中文变成乱码。
    不动 encoding、只放宽 errors,是为了避免个别字符触发 UnicodeEncodeError 崩掉。
    """
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")
        except Exception:
            pass


def say(msg):
    print(msg, flush=True)


# ---------------- ffmpeg 工具 ----------------
def _ff(args, timeout=None):
    return subprocess.run([FFMPEG] + args, capture_output=True, text=True,
                          encoding="utf-8", errors="replace", timeout=timeout)


def probe_loudness(path):
    """返回 (integrated LUFS, true peak dBTP),失败返回 (None, None)"""
    r = _ff(["-i", path, "-af", "loudnorm=print_format=json", "-f", "null", "-"])
    idx = r.stderr.rfind("{")
    end = r.stderr.rfind("}", idx) if idx >= 0 else -1
    if idx < 0 or end < 0:
        return None, None
    try:
        info = json.loads(r.stderr[idx:end + 1])
        return float(info.get("input_i")), float(info.get("input_tp"))
    except Exception:
        return None, None


def probe_duration(path):
    r = _ff(["-i", path, "-f", "null", "-"])
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", r.stderr)
    if not m:
        return None
    h, mnt, s = m.groups()
    return int(h) * 3600 + int(mnt) * 60 + float(s)


def prepare_input(src, dst):
    """输入规范化:纯增益到 TARGET_LUFS,不动动态、保证 peak ≤ -1 dBTP;输出 float32 wav"""
    li, tp = probe_loudness(src)
    if li is None:
        shutil.copy2(src, dst)
        say("  响度测量失败,沿用原文件")
        return
    gain = TARGET_LUFS - li
    if tp is not None:
        gain = min(gain, -1.0 - tp)
    r = _ff(["-y", "-i", src, "-af", f"volume={gain:.2f}dB",
             "-c:a", "pcm_f32le", "-ar", str(SAMPLE_RATE), "-ac", "2", dst])
    if r.returncode != 0 or not os.path.exists(dst):
        shutil.copy2(src, dst)
        say(f"  响度规范化失败,沿用原文件({r.stderr[-200:]})")
        return
    say(f"  响度规范化: {li:.1f} LUFS → {TARGET_LUFS:.0f} LUFS (增益 {gain:+.2f} dB)")


def trim_wav(src, dst, dur):
    """截断到 dur 秒(融合前长度对齐用)"""
    _ff(["-y", "-i", src, "-t", f"{dur:.3f}", "-c:a", "pcm_f32le", dst])


def to_mp3(src, dst):
    r = _ff(["-y", "-i", src, "-q:a", "2", dst])
    return r.returncode == 0


# ---------------- 推理 ----------------
def _inf_cmd(step, input_path, store_dir):
    return [PY, "-u", INF,
            "--model_type", step["model_type"],
            "--config_path", os.path.join(MODELS, step["cfg"]),
            "--start_check_point", os.path.join(MODELS, step["ckpt"]),
            "--input_folder", input_path,
            "--store_dir", store_dir,
            "--extract_instrumental",
            "--bigshifts", str(BIGSHIFTS)]


def find_stems(store_dir):
    """把推理产物按文件名归类: {'vocals':p, 'instrumental':p, 'noreverb':p, ...}"""
    found = {}
    for p in glob.glob(os.path.join(store_dir, "**", "*.wav"), recursive=True):
        name = os.path.splitext(os.path.basename(p))[0].lower()
        if "noreverb" in name:
            key = "noreverb"
        elif "vocals" in name:
            key = "vocals"
        elif "instrumental" in name:
            key = "instrumental"
        else:
            key = name
        found.setdefault(key, p)
    return found


def start_inference(step, input_path, store_dir):
    """非阻塞启动一个分离进程(输出重定向到临时文件,避免管道堵死)"""
    os.makedirs(store_dir, exist_ok=True)
    cmd = _inf_cmd(step, input_path, store_dir)
    env = os.environ.copy()
    env.pop("PYTHONPATH", None)
    say(f"  [{step['short']}] 分离中(bigshifts={BIGSHIFTS})…")
    out_f = tempfile.TemporaryFile(mode="w+", encoding="utf-8", errors="replace")
    err_f = tempfile.TemporaryFile(mode="w+", encoding="utf-8", errors="replace")
    proc = subprocess.Popen(cmd, env=env, stdout=out_f, stderr=err_f, cwd=MSST)
    proc._out_f = out_f
    proc._err_f = err_f
    return proc


def collect_inference(proc, step, store_dir):
    """等待进程结束,校验所需 stem 齐全"""
    proc.wait(timeout=7200)
    proc._out_f.seek(0)
    proc._err_f.seek(0)
    err = proc._err_f.read()
    proc._out_f.close()
    proc._err_f.close()
    if proc.returncode != 0:
        raise RuntimeError(f"分离失败 {step['ckpt']}: {err[-1500:]}")

    stems = find_stems(store_dir)
    need = step.get("need", ("vocals", "instrumental"))
    missing = [k for k in need if k not in stems]
    if missing:
        raise RuntimeError(f"输出缺失 {step['ckpt']}: 缺 {missing},实得 {sorted(stems)}")
    say(f"  [{step['short']}] 完成")
    return stems


def run_inference_parallel(steps, input_path, out_dir):
    """并行跑一批模型(每批 PARALLEL 个),返回 {short: {stem: path}}"""
    results = {}
    batch = []
    for step in steps:
        d = os.path.join(out_dir, step["sub"])
        batch.append((step, start_inference(step, input_path, d)))
        if len(batch) >= PARALLEL:
            for s, p in batch:
                results[s["short"]] = collect_inference(p, s, os.path.join(out_dir, s["sub"]))
            batch = []
    for s, p in batch:
        results[s["short"]] = collect_inference(p, s, os.path.join(out_dir, s["sub"]))
    return results


# ---------------- 融合 ----------------
def run_ensemble(files, mode, output):
    cmd = [PY, "-u", ENS, "--files"] + files + ["--type", mode, "--output", output]
    env = os.environ.copy()
    env.pop("PYTHONPATH", None)
    try:
        r = subprocess.run(cmd, env=env, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=3600, cwd=MSST)
    except subprocess.TimeoutExpired:
        return False, "ensemble 超时"
    if r.returncode != 0 or not os.path.exists(output):
        return False, r.stderr[-600:]
    return True, ""


def ensemble_files(out_dir, files, label, modes=None):
    """多文件融合;files = {短名: wav路径};输出 <label>_融合N模型_<mode>.wav

    默认给 mag_median_fft + mag_avg_fft:
      mag_median_fft  幅度取中位,相位取最响那一路(推荐,不会相位抵消)
      mag_avg_fft     幅度加权平均,相位取最响那一路
    旧的 median_fft / avg_fft 直接对复数做运算,偶数个模型时会因相位差抵消
    幅度,细频段听感上会「被抹掉」,所以这里不再默认产出。
    """
    if modes is None:
        modes = FUSE_MODES
    items = []
    for name, p in files.items():
        d = probe_duration(p)
        if d is None:
            say(f"  融合: {name} 时长探测失败,跳过")
            continue
        items.append((name, p, d))
    if len(items) < 2:
        say("  融合:不足 2 个模型输出,跳过")
        return {}
    tmp = os.path.join(out_dir, "_ensemble_in")
    os.makedirs(tmp, exist_ok=True)
    common = min(d for _, _, d in items)
    paths, order = [], []
    for name, p, d in items:
        dst = os.path.join(tmp, f"{name}.wav")
        if d > common + 0.01:
            trim_wav(p, dst, common)
        else:
            shutil.copy2(p, dst)
        paths.append(dst)
        order.append(name)

    n = len(paths)
    made = {}
    try:
        for mode in modes:
            out = os.path.join(out_dir, f"{label}_融合{n}模型_{mode}.wav")
            ok, err = run_ensemble(paths, mode, out)
            if ok:
                say(f"  融合 {n} 模型 {mode} 完成 → {os.path.basename(out)}")
                made[mode] = out
            else:
                say(f"  融合 {mode} 失败: {err}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return made


def pick_fused(out_dir, label, n, prefer="mag_median_fft"):
    """优先取 prefer 指定的融合结果,退回其他已产出的模式"""
    order = [prefer, "mag_median_fft", "mag_avg_fft", "median_fft", "avg_fft"]
    seen = []
    for m in order:
        if m in seen:
            continue
        seen.append(m)
        p = os.path.join(out_dir, f"{label}_融合{n}模型_{m}.wav")
        if os.path.exists(p):
            return p
    return None


# ---------------- 输出目录 / 收尾 ----------------
def make_out_dir(src, tag):
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    base = os.path.splitext(os.path.basename(src.rstrip("\\/")))[0] if os.path.isfile(src) \
        else os.path.basename(src.rstrip("\\/"))
    out_dir = os.path.join(OUT_ROOT, f"{ts}_{base}_{tag}")
    os.makedirs(out_dir, exist_ok=True)
    return out_dir


def export_mp3(out_dir):
    mp3_dir = os.path.join(out_dir, "mp3_试听")
    os.makedirs(mp3_dir, exist_ok=True)
    for f in sorted(glob.glob(os.path.join(out_dir, "*.wav"))):
        to_mp3(f, os.path.join(mp3_dir, os.path.splitext(os.path.basename(f))[0] + ".mp3"))
    return mp3_dir


def list_dir_input(path):
    """输入既支持单个音频文件,也支持目录(目录里按扩展名展开)"""
    if os.path.isfile(path):
        return [path]
    if os.path.isdir(path):
        out = [p for p in sorted(glob.glob(os.path.join(path, "*")))
               if os.path.isfile(p) and os.path.splitext(p)[1].lower() in AUDIO_EXT]
        if not out:
            raise SystemExit(f"目录里没有可处理的音频文件: {path}")
        return out
    raise SystemExit(f"路径不存在: {path}")


def add_common_args(parser):
    parser.add_argument("--out", default=None, help="输出根目录(默认 <项目>/分离输出)")
    parser.add_argument("--bigshifts", type=int, default=BIGSHIFTS,
                        help=f"循环平移平均次数,默认 {BIGSHIFTS}")
    parser.add_argument("--parallel", type=int, default=PARALLEL,
                        help=f"并行进程数,默认 {PARALLEL}")
    parser.add_argument("--no-mp3", action="store_true", help="不导出 mp3 试听")
    parser.add_argument("--no-ensemble", action="store_true", help="不做多模型融合")
    parser.add_argument("--fuse", nargs="+", default=None,
                        choices=["mag_median_fft", "mag_avg_fft", "median_fft", "avg_fft",
                                 "median_wave", "avg_wave", "min_fft", "max_fft"],
                        help="融合算法,可给多个。默认 mag_median_fft mag_avg_fft")
    return parser


def apply_common_args(args):
    global BIGSHIFTS, PARALLEL, OUT_ROOT, FUSE_MODES
    if args.bigshifts and args.bigshifts > 0:
        BIGSHIFTS = args.bigshifts
    if args.parallel and args.parallel > 0:
        PARALLEL = args.parallel
    if getattr(args, "fuse", None):
        FUSE_MODES = tuple(args.fuse)
    if args.out:
        OUT_ROOT = os.path.abspath(args.out)
        os.makedirs(OUT_ROOT, exist_ok=True)
