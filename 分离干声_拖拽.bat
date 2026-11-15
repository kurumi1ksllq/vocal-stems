@echo off
setlocal
set PYTHONPATH=
cd /d E:\AI\vocal-stems

if "%~1"=="" (
    echo.
    echo   把要分离的音频文件或文件夹拖到这个窗口上,然后按回车
    echo   支持 mp3 / wav / flac,一个文件或整个文件夹都可以
    echo.
    pause
    exit /b
)

set "INPUT=%~1"
set "OUTDIR=E:\AI\vocal-stems\分离输出"

echo ========================================
echo   MelBand Roformer 干声分离
echo   模型: KimberleyJensen 版 (SDR 10.98)
echo   输入: %INPUT%
echo   输出: %OUTDIR%
echo ========================================
echo.

.venv\Scripts\python.exe inference.py --model_type mel_band_roformer --config_path models\config_melband_kj.yaml --start_check_point models\model_melband_kj.ckpt --input_folder "%INPUT%" --store_dir "%OUTDIR%" --extract_instrumental

echo.
echo   完成!结果在: %OUTDIR%
echo   vocals.wav = 人声干声, instrumental.wav = 伴奏
echo.
pause
