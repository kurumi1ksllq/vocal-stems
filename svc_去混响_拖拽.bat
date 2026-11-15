@echo off
setlocal
title SVC 去混响 - de-reverb
echo ============================================
echo   去混响: anvuew BS-RoFormer dereverb
echo   输出 干声 + 混响成分
echo ============================================
echo.
if "%~1"=="" (
    echo 请把音频文件或文件夹拖到本脚本上运行
    pause
    exit /b
)
set "PYTHONPATH="
"E:\AI\msst_zfturbo\.venv\Scripts\python.exe" -u "E:\AI\msst_zfturbo\svc_dereverb.py" "%~1"
echo.
pause
