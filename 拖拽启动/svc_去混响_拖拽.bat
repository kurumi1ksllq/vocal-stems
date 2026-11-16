@echo off
chcp 936 >nul
setlocal
title SVC 去混响 - de-reverb
set "ROOT=%~dp0..\"
set "PYTHONPATH="
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
if not exist "%ROOT%.venv\Scripts\python.exe" (
    echo 找不到 %ROOT%.venv\Scripts\python.exe
    pause
    exit /b 1
)
"%ROOT%.venv\Scripts\python.exe" -u "%ROOT%svc_dereverb.py" "%~1"
echo.
pause
