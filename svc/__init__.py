# -*- coding: utf-8 -*-
# SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
# Copyright (c) 2026 kurumi1ksllq
"""干声分离三件套。

三件套是三个可独立运行的脚本（不是 import 用的库）：

    python svc/svc_stems.py     整曲.wav
    python svc/svc_karaoke.py   人声.wav
    python svc/svc_dereverb.py  纯主唱.wav

它们共享 svc_common.py。这个 __init__.py 只是让 svc 成为正规包，
方便 pyproject.toml 打包和 `python -m svc.svc_stems` 这类调用。
"""
