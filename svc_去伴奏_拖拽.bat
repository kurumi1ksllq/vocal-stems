@echo off
setlocal
title SVC 去伴奏 - vocals / instrumental
echo ============================================
echo   去伴奏: 3 个模型分离人声(含和声)与伴奏
echo   1. KJ mel_band_roformer
echo   2. viperx ep3005
echo   3. gabox vocals
echo   融合 mag_median_fft / mag_avg_fft
echo ============================================
echo.
if "%~1"=="" (
    echo 请把音频文件或文件夹拖到本脚本上运行
    pause
    exit /b
)
set "PYTHONPATH="
"E:\AI\vocal-stems\.venv\Scripts\python.exe" -u "E:\AI\vocal-stems\svc_stems.py" "%~1"
echo.
pause
