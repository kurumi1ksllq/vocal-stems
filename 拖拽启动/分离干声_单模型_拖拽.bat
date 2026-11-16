@echo off
chcp 936 >nul
setlocal
set "ROOT=%~dp0..\"
set "PYTHONPATH="
cd /d "%~dp0"

if "%~1"=="" (
    echo.
    echo   把要分离的音频文件或文件夹拖到这个窗口上,然后按回车
    echo   支持 mp3 / wav / flac,一个文件或整个文件夹都可以
    echo.
    pause
    exit /b
)

set "INPUT=%~1"
set "OUTDIR=%ROOT%分离输出"

echo ========================================
echo   单模型快速版: 只跑 KJ,不做融合
echo   比 svc_去伴奏_拖拽.bat 快,但质量略低
echo   模型: KimberleyJensen 版 (SDR 10.98)
echo   输入: %INPUT%
echo   输出: %OUTDIR%
echo ========================================
echo.

"%ROOT%.venv\Scripts\python.exe" -u "%ROOT%inference.py" --model_type mel_band_roformer --config_path "%ROOT%models\config_melband_kj.yaml" --start_check_point "%ROOT%models\model_melband_kj_fp16.ckpt" --input_folder "%INPUT%" --store_dir "%OUTDIR%" --extract_instrumental

echo.
echo   完成!结果在: %OUTDIR%
echo   vocals.wav = 人声干声, instrumental.wav = 伴奏
echo.
pause
