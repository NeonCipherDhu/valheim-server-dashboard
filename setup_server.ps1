# setup_server.ps1
# Automates the download of SteamCMD and installation/updating of the Valheim Dedicated Server.

$ErrorActionPreference = "Stop"
$WorkingDir = $PSScriptRoot
$SteamCmdDir = Join-Path $WorkingDir "steamcmd"
$ServerDir = Join-Path $WorkingDir "server"
$SteamCmdZip = Join-Path $SteamCmdDir "steamcmd.zip"
$SteamCmdExe = Join-Path $SteamCmdDir "steamcmd.exe"

Write-Host "=== Valheim Dedicated Server Setup ===" -ForegroundColor Cyan

# 1. Ensure steamcmd directory exists
if (-not (Test-Path $SteamCmdDir)) {
    New-Item -ItemType Directory -Path $SteamCmdDir -Force | Out-Null
}

# 2. Download SteamCMD if not present
if (-not (Test-Path $SteamCmdExe)) {
    Write-Host "Downloading SteamCMD..." -ForegroundColor Yellow
    $url = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip"
    Invoke-WebRequest -Uri $url -OutFile $SteamCmdZip -UseBasicParsing
    
    Write-Host "Extracting SteamCMD..." -ForegroundColor Yellow
    Expand-Archive -Path $SteamCmdZip -DestinationPath $SteamCmdDir -Force
    Remove-Item $SteamCmdZip -Force -ErrorAction SilentlyContinue
}

# 3. Create server directory
if (-not (Test-Path $ServerDir)) {
    New-Item -ItemType Directory -Path $ServerDir -Force | Out-Null
}

# 4. Install / Update Valheim Dedicated Server (App ID 896660)
Write-Host "Downloading/Updating Valheim Dedicated Server (AppID 896660)..." -ForegroundColor Yellow
Write-Host "This might take a few minutes depending on your internet connection." -ForegroundColor Gray

$ServerExe = Join-Path $ServerDir "valheim_server.exe"

$argsList = @(
    "+@sSteamCmdForcePlatformType", "windows",
    "+force_install_dir", $ServerDir,
    "+login", "anonymous",
    "+app_update", "896660", "validate",
    "+quit"
)

$maxAttempts = 3
$attempt = 1
while (-not (Test-Path $ServerExe) -and $attempt -le $maxAttempts) {
    if ($attempt -gt 1) {
        Write-Host "`n[RETRY $attempt/$maxAttempts] Resuming download and validation..." -ForegroundColor Yellow
        Start-Sleep -Seconds 3
    }
    & $SteamCmdExe $argsList
    $attempt++
}

if (Test-Path $ServerExe) {
    Write-Host "`nValheim Dedicated Server successfully installed/updated at:" -ForegroundColor Green
    Write-Host "  $ServerExe" -ForegroundColor Green
} else {
    Write-Error "valheim_server.exe was not found in $ServerDir after $maxAttempts attempts. Please check your network connection and re-run setup."
}

Write-Host "`nSetup complete!" -ForegroundColor Cyan
