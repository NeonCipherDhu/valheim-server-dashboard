@echo off
title Valheim Dedicated Server - AMABOYS_DServer
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\start_server.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Server exited with code %ERRORLEVEL%.
    pause
)
