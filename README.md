# Music Source Separation Universal Training Code

> **本地改造版 (2026-11)** — 在原 ZFTurbo/MSST 基础上追加了三条干声分离脚本(SVC 三件套),
> 并针对 RTX 3070 8GB 做了模型裁剪与 fp16 化。仓库只跟踪代码,模型权重与音频资产不入库,
> 见文末「本地改造说明」。

Repository for training models for music source separation. Repository is based on [kuielab code](https://github.com/kuielab/sdx23/tree/mdx_AB/my_submission/src) for [SDX23 challenge](https://github.com/kuielab/sdx23/tree/mdx_AB/my_submission/src). The main idea of this repository is to create training code, which is easy to modify for experiments. Brought to you by [MVSep.com](https://mvsep.com).

## Models

Model can be chosen with `--model_type` arg.

Available models for training:

* MDX23C based on [KUIELab TFC TDF v3 architecture](https://github.com/kuielab/sdx23/). Key: `mdx23c`.
* Demucs4HT [[Paper](https://arxiv.org/abs/2211.08553)]. Key: `htdemucs`.
* VitLarge23 based on [Segmentation Models Pytorch](https://github.com/qubvel/segmentation_models.pytorch). Key: `segm_models`.
* TorchSeg based on [TorchSeg module](https://github.com/qubvel/segmentation_models.pytorch). Key: `torchseg`.
* Band Split RoFormer [[Paper](https://arxiv.org/abs/2309.02612), [Repository](https://github.com/lucidrains/BS-RoFormer)] . Key: `bs_roformer`.
* Mel-Band RoFormer [[Paper](https://arxiv.org/abs/2310.01809), [Repository](https://github.com/lucidrains/BS-RoFormer)]. Key: `mel_band_roformer`.
* Swin Upernet [[Paper](https://arxiv.org/abs/2103.14030)] Key: `swin_upernet`.
* BandIt Plus [[Paper](https://arxiv.org/abs/2309.02539), [Repository](https://github.com/karnwatcharasupat/bandit)] Key: `bandit`.
* SCNet [[Paper](https://arxiv.org/abs/2401.13276), [Official Repository](https://github.com/starrytong/SCNet), [Unofficial Repository](https://github.com/amanteur/SCNet-PyTorch)] Key: `scnet`.
* BandIt v2 [[Paper](https://arxiv.org/abs/2407.07275), [Repository](https://github.com/kwatcharasupat/bandit-v2)] Key: `bandit_v2`.
* Apollo [[Paper](https://arxiv.org/html/2409.08514v1), [Repository](https://github.com/JusperLee/Apollo)] Key: `apollo`.
* BSMamba2 [[Paper](https://arxiv.org/abs/2508.14556), [Repository](https://github.com/EuiYeonKim/BSMamba2)] Key: `bs_mamba2`.
* Conformer [[Paper](https://arxiv.org/abs/2005.08100), [Repository](https://github.com/lucidrains/conformer)] Key: `conformer`.
* BS Conformer Key: `bs_conformer`
* SCNet Tran Key: `scnet_tran`.
* SCNet Masked Key: `scnet_masked`.

1. **Note 1**: For `segm_models` there are many different encoders is possible. [Look here](https://github.com/qubvel/segmentation_models.pytorch#encoders-).
2. **Note 2**: Thanks to [@lucidrains](https://github.com/lucidrains) for recreating the RoFormer models based on papers.
3. **Note 3**: For `torchseg` gives access to more than 800 encoders from `timm` module. It's similar to `segm_models`.

## How to: Train

To train model you need to:

1) Choose model type with option `--model_type`, including: `mdx23c`, `htdemucs`, `segm_models`, `mel_band_roformer`, `bs_roformer`.
2) Choose location of config for model `--config_path` `<config path>`. You can find examples of configs in [configs folder](configs/). Prefixes `config_musdb18_` are examples for [MUSDB18 dataset](https://sigsep.github.io/datasets/musdb.html).
3) If you have a check-point from the same model or from another similar model you can use it with option: `--start_check_point` `<weights path>`
4) Choose path where to store results of training `--results_path` `<results folder path>`

### Training example

```bash
python train.py \
    --model_type mel_band_roformer \
    --config_path configs/config_mel_band_roformer_vocals.yaml \
    --start_check_point results/model.ckpt \
    --results_path results/ \
    --data_path 'datasets/dataset1' 'datasets/dataset2' \
    --valid_path datasets/musdb18hq/test \
    --num_workers 4 \
    --device_ids 0
```

All training parameters are [here](https://github.com/ZFTurbo/Music-Source-Separation-Training/blob/main/utils/settings.py#L20).

### Training with LoRA

Look here: [LoRA training](docs/LoRA.md)

## How to: Inference

### Inference example

```bash
python inference.py \
    --model_type mdx23c \
    --config_path configs/config_mdx23c_musdb18.yaml \
    --start_check_point results/last_mdx23c.ckpt \
    --input_folder input/wavs/ \
    --store_dir separation_results/
```

All inference parameters are [here](https://github.com/ZFTurbo/Music-Source-Separation-Training/blob/main/utils/settings.py#L130).
Convert models to ONNX and TensorRT formats [here](https://github.com/ZFTurbo/MSS_ONNX_TensorRT).

## Useful notes

* All batch sizes in config are adjusted to use with single NVIDIA A6000 48GB. If you have less memory please adjust correspodningly in model config `training.batch_size` and `training.gradient_accumulation_steps`.
* It's usually always better to start with old weights even if shapes not fully match. Code supports loading weights for not fully same models (but it must have the same architecture). Training will be much faster.

## Code description

* `configs/config_*.yaml` - configuration files for models
* `models/*` - set of available models for training and inference
* `dataset.py` - dataset which creates new samples for training
* `gui-wx.py` - GUI interface for code
* `inference.py` - process folder with music files and separate them
* `train.py` - main training code for single GPU
* `train_ddp.py` - training code for Multi GPU config. Faster than `train.py`. Use it for 2 or more GPUs.
* `utils.py` - common functions used by train/valid
* `valid.py` - validation of model with metrics
* `ensemble.py` - useful script to ensemble results of different models to make results better (see [docs](docs/ensemble.md)).   

## Pre-trained models

Look here: [List of Pre-trained models](docs/pretrained_models.md)

If you trained some good models, please, share them. You can post config and model weights [in this issue](https://github.com/ZFTurbo/Music-Source-Separation-Training/issues/1).

## Dataset types

Look here: [Dataset types](docs/dataset_types.md)

## Augmentations

Look here: [Augmentations](docs/augmentations.md)

## Graphical user interface

Look here: [GUI documentation](docs/gui.md) or see tutorial on [Youtube](https://youtu.be/M8JKFeN7HfU)

## Citation

* [arxiv paper](https://arxiv.org/abs/2305.07489)

```text
@misc{solovyev2023benchmarks,
      title={Benchmarks and leaderboards for sound demixing tasks}, 
      author={Roman Solovyev and Alexander Stempkovskiy and Tatiana Habruseva},
      year={2023},
      eprint={2305.07489},
      archivePrefix={arXiv},
      primaryClass={cs.SD}
}
```

---

## 本地改造说明 (Local modifications, 2026-11)

### 三条分离脚本 (SVC 三件套)

拆自旧的 `karaoke_pipeline.py`,现在各自独立、可单独跑:

| 脚本 | 作用 | 模型 |
|---|---|---|
| `svc_stems.py` | 去伴奏:出「人声(含和声)」+「伴奏」 | KJ + gabox_vocals (mel_band_roformer) |
| `svc_karaoke.py` | 去和声:出「纯主唱」+「和声」 | anvuew (BS) + gabox (MelBand) |
| `svc_dereverb.py` | 去混响:出「干声」+「混响成分」 | anvuew dereverb (BS) |

共用层 `svc_common.py`(ffmpeg 响度规范化、并行推理、融合、mp3 导出)。
拖拽入口:`svc_去伴奏_拖拽.bat` / `svc_去和声_拖拽.bat` / `svc_去混响_拖拽.bat`。

```bash
# 单独跑
python svc_stems.py    整曲.wav
python svc_karaoke.py  人声.wav
python svc_dereverb.py 纯主唱.wav

# 级联(给整曲,自动串联)
python svc_karaoke.py  整曲.wav  --from-mix       # 去伴奏 -> 去和声
python svc_dereverb.py 整曲.wav  --from-vocals    # 去伴奏 -> 去混响
python svc_dereverb.py 整曲.wav  --from-karaoke   # 去伴奏 -> 去和声 -> 去混响
```

### 融合算法

原 `ensemble.py` 直接对复数做 median/mean。`np.median` 作用在复数上按**实部**排序而非模,
偶数个模型时取中间两个的均值,会让幅度腰斩——听感上表现为细频段「被抹掉」。

新增两种算法(原 8 种行为完全不变):

- `mag_median_fft` — 幅度取中位,相位取幅度最大那一路 **(默认)**
- `mag_avg_fft` — 幅度加权平均,相位取幅度最大那一路

实测(4 模型,16k-20k 频段能量保持率):`median_fft` 0.851 → `mag_median_fft` 0.963。

### 模型裁剪与 fp16

优先保证 RTX 3070 8GB 上的速度与显存:

- 去伴奏 3 → 2 模型(砍掉 viperx ep3005,它单独占 62% 耗时)
- 去和声 4 → 2 模型(anvuew + gabox,跨架构互补;与 4 模型融合相关系数 0.99997)
- 全部权重存为 fp16(体积减半)。`inference.py` 加载后 `model.float()`,**计算全程仍是 fp32**,
  因此不影响老显卡兼容性,实测 SNR 61~70 dB。

### 模型权重不入库

`.gitignore` 忽略 `*.ckpt` 与所有音频目录。`models/` 下的 `*.yaml`(模型结构定义)要入库。
需要权重时从以下来源下载后放到 `models/`:

- [ZFTurbo/MSST Releases](https://github.com/ZFTurbo/Music-Source-Separation-Training/releases)
- [KimberleyJSN/melbandroformer](https://huggingface.co/KimberleyJSN/melbandroformer)
- [anvuew](https://huggingface.co/anvuew) 系列

本机当前用到的 5 个权重(全部 `_fp16.ckpt` 后缀)见 `svc_stems.py` / `svc_karaoke.py` / `svc_dereverb.py` 的 STEPS 定义。

---

## 许可证 (License)

本仓库采用**双许可**:

| 范围 | 协议 |
|---|---|
| `svc_stems.py` / `svc_karaoke.py` / `svc_dereverb.py` / `svc_common.py`<br/>四个 `svc_*` 拖拽 bat / 新增的 gabox karaoke config<br/>本 README 的「本地改造说明」章节 | **PolyForm Strict 1.0.0** (见 `LICENSE`) |
| `configs/` `models/*.py` `utils/` `gui/` `docs/` `scripts/` `tests/`<br/>`train*.py` `valid*.py` `inference.py` `ensemble.py` | **MIT** (见 `LICENSES/MIT.txt`) |

### PolyForm Strict 1.0.0 意味着什么

允许:**阅读源码、个人研究、实验、测试、个人学习、私人娱乐、业余项目、宗教活动**。

禁止:**分发本软件、修改本软件、基于本软件创作新作品、任何商业用途**。

也就是说 —— 你可以看、可以自己跑着玩,但不能拿去改、不能二次分发、不能商用。

### 为什么是双许可

`inference.py`、`ensemble.py` 以及 `configs/`、`models/`、`utils/` 等 169 个文件派生自
[ZFTurbo/Music-Source-Separation-Training](https://github.com/ZFTurbo/Music-Source-Separation-Training)
(MIT）。MIT 授权**不可撤销**——任何人拿到这些内容时就已经永久取得了使用/修改/分发的权利,
不存在把它们改成更严格协议的可能。所以这部分只能继续按 MIT 提供。

PolyForm Strict 只覆盖由本项目作者原创的 9 个文件。

### 上游致谢

- [ZFTurbo/Music-Source-Separation-Training](https://github.com/ZFTurbo/Music-Source-Separation-Training) — 训练/推理框架 (MIT)
- [lucidrains/BS-RoFormer](https://github.com/lucidrains/BS-RoFormer) — RoFormer 架构
- 模型权重作者: KimberleyJensen / anvuew / aufr33 / viperx / gabox 等
