@echo off
chcp 936 >nul
REM SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
setlocal
title SVC 去伴奏 - vocals / instrumental
set "ROOT=%~dp0..\"
set "PYTHONPATH="
echo ============================================
echo   去伴奏: 2 个模型分离人声(含和声)与伴奏
echo   1. KJ      mel_band_roformer
echo   2. gabox   mel_band_roformer
echo   融合 mag_median_fft / mag_avg_fft
echo ============================================
echo.
if "%~1"=="" (
    echo 请把音频文件或文件夹拖到本脚本上运行
    pause
    exit /b
)
if not exist "%ROOT%.venv\Scripts\python.exe" (
    echo 找不到 %ROOT%.venv\Scripts\python.exe
    pause
    exit /b 1
)
"%ROOT%.venv\Scripts\python.exe" -u "%ROOT%svc_stems.py" "%~1"
echo.
pause
