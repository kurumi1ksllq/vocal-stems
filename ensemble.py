# coding: utf-8
# SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
__author__ = 'Roman Solovyev (ZFTurbo): https://github.com/ZFTurbo/'

import os
import librosa
import soundfile as sf
import numpy as np
import argparse


def stft(wave, nfft, hl):
    """wave: (channels, length) -> (channels, freq, time). 支持任意声道数(含单声道)。"""
    wave = np.atleast_2d(wave)
    chans = [librosa.stft(np.asfortranarray(np.asarray(wave[c], dtype=np.float32)),
                          n_fft=nfft, hop_length=hl) for c in range(wave.shape[0])]
    return np.asfortranarray(np.stack(chans, axis=0))


def istft(spec, hl, length):
    """spec: (channels, freq, time) -> (channels, length)."""
    spec = np.atleast_2d(spec) if spec.ndim == 2 else spec
    chans = [librosa.istft(np.asfortranarray(spec[c]), hop_length=hl, length=length)
             for c in range(spec.shape[0])]
    return np.asfortranarray(np.stack(chans, axis=0))


def magnitude_median_fft(pred_track):
    """幅度取中位,相位取幅度最大那一路。

    np.median 作用在复数上时按『实部』排序,不是按模。STFT 系数里模和实部
    没有单调关系,于是中位可能落在一个几乎静音的样本和一个正常样本之间,
    取两者算术均值时幅度被腰斩 —— 表现就是某些细频段『被抵消』。
    模型数为偶数时(np.median 取中间两个的均值)尤其明显。

    这里把幅度和相位拆开处理:
      - 幅度: 逐点取 |z| 的中位数 —— 数学上不可能小于所有输入的模
      - 相位: 逐点取幅度最大的那一路 —— 最可信的模型,不做插值
    """
    mag = np.abs(pred_track)
    imax = np.argmax(mag, axis=0)
    phase_ref = np.take_along_axis(pred_track, imax[None], axis=0)[0]
    return np.median(mag, axis=0) * np.exp(1j * np.angle(phase_ref))


def magnitude_avg_fft(pred_track, weights=None):
    """幅度加权平均,相位取幅度最大那一路。比 avg_fft 温和,不会整体衰减。"""
    mag = np.abs(pred_track)
    if weights is None:
        w = np.ones(pred_track.shape[0])
    else:
        w = np.asarray(weights, dtype=np.float64)
    wsum = w.sum()
    if wsum <= 0:
        w, wsum = np.ones_like(w), float(len(w))
    mag_avg = np.tensordot(w, mag, axes=(0, 0)) / wsum
    imax = np.argmax(mag, axis=0)
    phase_ref = np.take_along_axis(pred_track, imax[None], axis=0)[0]
    return mag_avg * np.exp(1j * np.angle(phase_ref))


def absmax(a, *, axis):
    dims = list(a.shape)
    dims.pop(axis)
    indices = np.ogrid[tuple(slice(0, d) for d in dims)]
    argmax = np.abs(a).argmax(axis=axis)
    indices.insert((len(a.shape) + axis) % len(a.shape), argmax)
    return a[tuple(indices)]


def absmin(a, *, axis):
    dims = list(a.shape)
    dims.pop(axis)
    indices = np.ogrid[tuple(slice(0, d) for d in dims)]
    argmax = np.abs(a).argmin(axis=axis)
    indices.insert((len(a.shape) + axis) % len(a.shape), argmax)
    return a[tuple(indices)]


def lambda_max(arr, axis=None, key=None, keepdims=False):
    idxs = np.argmax(key(arr), axis)
    if axis is not None:
        idxs = np.expand_dims(idxs, axis)
        result = np.take_along_axis(arr, idxs, axis)
        if not keepdims:
            result = np.squeeze(result, axis=axis)
        return result
    else:
        return arr.flatten()[idxs]


def lambda_min(arr, axis=None, key=None, keepdims=False):
    idxs = np.argmin(key(arr), axis)
    if axis is not None:
        idxs = np.expand_dims(idxs, axis)
        result = np.take_along_axis(arr, idxs, axis)
        if not keepdims:
            result = np.squeeze(result, axis=axis)
        return result
    else:
        return arr.flatten()[idxs]


def average_waveforms(pred_track, weights, algorithm):
    """
    :param pred_track: shape = (num, channels, length)
    :param weights: shape = (num, )
    :param algorithm: One of avg_wave, median_wave, min_wave, max_wave, avg_fft, median_fft, min_fft, max_fft,
                      mag_median_fft, mag_avg_fft
    :return: averaged waveform in shape (channels, length)
    """

    pred_track = np.array(pred_track)
    final_length = pred_track.shape[-1]

    mod_track = []
    for i in range(pred_track.shape[0]):
        if algorithm == 'avg_wave':
            mod_track.append(pred_track[i] * weights[i])
        elif algorithm in ['median_wave', 'min_wave', 'max_wave']:
            mod_track.append(pred_track[i])
        elif algorithm in ['avg_fft', 'min_fft', 'max_fft', 'median_fft',
                           'mag_median_fft', 'mag_avg_fft']:
            spec = stft(pred_track[i], nfft=2048, hl=1024)
            if algorithm in ['avg_fft']:
                mod_track.append(spec * weights[i])
            else:
                mod_track.append(spec)
    pred_track = np.array(mod_track)

    if algorithm in ['avg_wave']:
        pred_track = pred_track.sum(axis=0)
        pred_track /= np.array(weights).sum().T
    elif algorithm in ['median_wave']:
        pred_track = np.median(pred_track, axis=0)
    elif algorithm in ['min_wave']:
        pred_track = np.array(pred_track)
        pred_track = lambda_min(pred_track, axis=0, key=np.abs)
    elif algorithm in ['max_wave']:
        pred_track = np.array(pred_track)
        pred_track = lambda_max(pred_track, axis=0, key=np.abs)
    elif algorithm in ['avg_fft']:
        pred_track = pred_track.sum(axis=0)
        pred_track /= np.array(weights).sum()
        pred_track = istft(pred_track, 1024, final_length)
    elif algorithm in ['min_fft']:
        pred_track = np.array(pred_track)
        pred_track = lambda_min(pred_track, axis=0, key=np.abs)
        pred_track = istft(pred_track, 1024, final_length)
    elif algorithm in ['max_fft']:
        pred_track = np.array(pred_track)
        pred_track = absmax(pred_track, axis=0)
        pred_track = istft(pred_track, 1024, final_length)
    elif algorithm in ['median_fft']:
        pred_track = np.array(pred_track)
        pred_track = np.median(pred_track, axis=0)
        pred_track = istft(pred_track, 1024, final_length)
    elif algorithm in ['mag_median_fft']:
        pred_track = magnitude_median_fft(np.array(pred_track))
        pred_track = istft(pred_track, 1024, final_length)
    elif algorithm in ['mag_avg_fft']:
        pred_track = magnitude_avg_fft(np.array(pred_track), weights)
        pred_track = istft(pred_track, 1024, final_length)
    return pred_track


def ensemble_files(args):
    parser = argparse.ArgumentParser()
    parser.add_argument("--files", type=str, required=True, nargs='+', help="Path to all audio-files to ensemble")
    parser.add_argument("--type", type=str, default='avg_wave',
                        help="One of avg_wave, median_wave, min_wave, max_wave, avg_fft, median_fft, min_fft, max_fft, "
                             "mag_median_fft (magnitude median + loudest-path phase), "
                             "mag_avg_fft (magnitude weighted average + loudest-path phase)")
    parser.add_argument("--weights", type=float, nargs='+', help="Weights to create ensemble. Number of weights must be equal to number of files")
    parser.add_argument("--output", default="res.wav", type=str, help="Path to wav file where ensemble result will be stored")
    if args is None:
        args = parser.parse_args()
    else:
        args = parser.parse_args(args)

    print('Ensemble type: {}'.format(args.type))
    print('Number of input files: {}'.format(len(args.files)))
    if args.weights is not None:
        weights = args.weights
    else:
        weights = np.ones(len(args.files))
    print('Weights: {}'.format(weights))
    print('Output file: {}'.format(args.output))
    data = []
    for f in args.files:
        if not os.path.isfile(f):
            print('Error. Can\'t find file: {}. Check paths.'.format(f))
            exit()
        print('Reading file: {}'.format(f))
        wav, sr = librosa.load(f, sr=None, mono=False)
        # wav, sr = sf.read(f)
        wav = np.atleast_2d(wav)
        print("Waveform shape: {} sample rate: {}".format(wav.shape, sr))
        data.append(wav)

    # 声道数对齐: 单声道扩展到与其他文件相同,全部单声道时补成双声道
    max_ch = max(w.shape[0] for w in data)
    if max_ch == 1:
        max_ch = 2
    fixed = []
    for w in data:
        if w.shape[0] < max_ch:
            w = np.repeat(w, max_ch // w.shape[0], axis=0)
        fixed.append(w)
    data = np.array(fixed)

    # 长度对齐: 不同模型的输出长度可能差几个采样,取最短
    min_len = min(w.shape[1] for w in data)
    if any(w.shape[1] != min_len for w in data):
        print('Trimming to shortest length: {}'.format(min_len))
        data = data[:, :, :min_len]
    data = np.array(data)
    res = average_waveforms(data, weights, args.type)
    print('Result shape: {}'.format(res.shape))
    sf.write(args.output, res.T, sr, 'FLOAT')


if __name__ == "__main__":
    ensemble_files(None)
