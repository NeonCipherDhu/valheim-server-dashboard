@echo off
title Stop Valheim Server Dashboard
cd /d "%~dp0"

echo ========================================================
echo        STOPPING VALHEIM SERVER DASHBOARD (PORT 8085)     
echo ========================================================
echo.

set KILLED=0

if exist "cache\dashboard.pid" (
    set /p DASH_PID=<cache\dashboard.pid
    if defined DASH_PID (
        taskkill /f /pid %DASH_PID% >nul 2>nul
        if %ERRORLEVEL% EQU 0 (
            echo Terminated dashboard process PID: %DASH_PID%
            set KILLED=1
        )
    )
    del "cache\dashboard.pid" >nul 2>nul
)

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8085" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        echo Terminated listener process on port 8085 (PID: %%a)
        set KILLED=1
    )
)

if %KILLED% EQU 1 (
    echo.
    echo Dashboard server stopped successfully.
) else (
    echo.
    echo No running dashboard server found on port 8085.
)

ping 127.0.0.1 -n 2 >nul
