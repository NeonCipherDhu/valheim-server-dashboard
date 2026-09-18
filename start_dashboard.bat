@echo off
title Valheim Server Dashboard
cd /d "%~dp0"

REM 1. Verify Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ========================================================================
    echo [ERROR] Node.js is not installed or not found in system PATH!
    echo ========================================================================
    echo Please install Node.js v18 or higher from https://nodejs.org/
    echo to run the Valheim Web Dashboard.
    echo.
    pause
    exit /b 1
)

REM 2. Verify SteamCMD and Valheim Dedicated Server engine
set "NEED_SERVER_INSTALL=0"
if not exist "steamcmd\steamcmd.exe" set "NEED_SERVER_INSTALL=1"
if not exist "server\valheim_server.exe" set "NEED_SERVER_INSTALL=1"

if "%NEED_SERVER_INSTALL%"=="1" (
    echo ========================================================================
    echo         VALHEIM DEDICATED SERVER - AUTOMATED ENVIRONMENT SETUP          
    echo ========================================================================
    echo.
    echo [ENVIRONMENT CHECK] SteamCMD or Valheim Dedicated Server engine missing.
    echo Automatically installing required game server binaries via SteamCMD...
    echo AppID 896660 - This may take several minutes on the initial download.
    echo.
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_server.ps1"
    if not exist "server\valheim_server.exe" (
        echo.
        echo [ERROR] Valheim Dedicated Server installation could not be completed!
        echo Please ensure your internet connection is active and re-run start_dashboard.bat.
        pause
        exit /b 1
    )
    echo.
    echo [SUCCESS] Valheim Dedicated Server engine and SteamCMD verified!
    echo.
)

REM 3. Verify Dashboard Web Dependencies (express, ws, etc.)
if not exist "dashboard\node_modules\express" (
    echo ========================================================================
    echo [ENVIRONMENT CHECK] Installing dashboard web dependencies...
    echo ========================================================================
    cd dashboard
    call npm install
    cd ..
    echo [SUCCESS] Dashboard dependencies installed successfully.
    echo.
)

REM 4. Parse Command Line Arguments
set "IS_CONSOLE=0"
set "SKIP_UPDATE=0"

if "%~1"=="/console" set "IS_CONSOLE=1"
if "%~1"=="-c" set "IS_CONSOLE=1"
if "%~1"=="--console" set "IS_CONSOLE=1"

if "%~2"=="/console" set "IS_CONSOLE=1"
if "%~2"=="-c" set "IS_CONSOLE=1"
if "%~2"=="--console" set "IS_CONSOLE=1"

if "%~1"=="/fast" set "SKIP_UPDATE=1"
if "%~1"=="-f" set "SKIP_UPDATE=1"
if "%~1"=="--skip-update" set "SKIP_UPDATE=1"
if "%~1"=="/noupdate" set "SKIP_UPDATE=1"

if "%~2"=="/fast" set "SKIP_UPDATE=1"
if "%~2"=="-f" set "SKIP_UPDATE=1"
if "%~2"=="--skip-update" set "SKIP_UPDATE=1"
if "%~2"=="/noupdate" set "SKIP_UPDATE=1"

REM Skip update if initial full installation was just completed
if "%NEED_SERVER_INSTALL%"=="1" set "SKIP_UPDATE=1"

REM 5. Automated Pre-Launch Update Check
if "%SKIP_UPDATE%"=="0" (
    echo ========================================================================
    echo         VALHEIM DEDICATED SERVER - CHECKING FOR UPDATES                 
    echo ========================================================================
    echo.

    REM Check Git repository updates if cloned via git
    if exist ".git" (
        where git >nul 2>nul
        if %ERRORLEVEL% EQU 0 (
            echo [1/2] Checking dashboard repository updates...
            git pull --ff-only >nul 2>nul
        )
    )

    REM Check Valheim Dedicated Server updates via SteamCMD
    tasklist /FI "IMAGENAME eq valheim_server.exe" 2>nul | find /I /N "valheim_server.exe">nul
    if %ERRORLEVEL% EQU 0 (
        echo [2/2] Valheim server process is currently running. Skipping binary update.
    ) else (
        echo [2/2] Verifying Valheim Dedicated Server version with SteamCMD...
        "steamcmd\steamcmd.exe" +@sSteamCmdForcePlatformType windows +force_install_dir "%~dp0server" +login anonymous +app_update 896660 +quit
    )
    echo.
    echo [UPDATE CHECK] All components verified and ready.
    echo.
)

REM 6. Launch Mode Routing
if "%IS_CONSOLE%"=="1" goto :console_mode

REM Normal Mode: Launch background silent service and close console window
echo Starting Valheim Operations Dashboard in background...
powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Process node -ArgumentList 'dashboard\server.js' -WorkingDirectory '%~dp0' -WindowStyle Hidden; Start-Sleep -Milliseconds 1200; Start-Process 'http://localhost:8085'"
exit /b 0

:console_mode
echo ========================================================================
echo             VALHEIM OPERATIONS WEB DASHBOARD - CONSOLE MODE             
echo ========================================================================
echo.
echo Starting Dashboard on http://localhost:8085 ...
echo Web dashboard will open in your browser automatically.
echo Press Ctrl+C in this console window anytime to stop the dashboard server.
echo.

start http://localhost:8085
node dashboard\server.js

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [EXIT] Dashboard process terminated with code %ERRORLEVEL%.
    pause
)
exit /b 0
