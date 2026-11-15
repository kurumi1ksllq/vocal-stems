@echo off
setlocal
title SVC 去和声 - 纯主唱 / 和声
echo ============================================
echo   去和声: 2 个模型从人声(含和声)中分出纯主唱
echo   1. anvuew  (BS-RoFormer)
echo   2. gabox   (Mel-Band RoFormer)
echo   跨架构互补, 融合 mag_median_fft / mag_avg_fft
echo ============================================
echo.
echo   输入请给: 人声轨 / 纯人声干声
echo   若是整曲, 请改用命令行加 --from-mix
echo.
if "%~1"=="" (
    echo 请把音频文件或文件夹拖到本脚本上运行
    pause
    exit /b
)
set "PYTHONPATH="
"E:\AI\msst_zfturbo\.venv\Scripts\python.exe" -u "E:\AI\msst_zfturbo\svc_karaoke.py" "%~1"
echo.
pause
