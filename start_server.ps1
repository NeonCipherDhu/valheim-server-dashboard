# start_server.ps1
# Valheim Dedicated Server Launcher for AMABOYS World

$Host.UI.RawUI.WindowTitle = "Valheim Dedicated Server - AMABOYS"
$WorkingDir = $PSScriptRoot
$ConfigFile = Join-Path $WorkingDir "server_config.json"
$ServerExe = Join-Path $WorkingDir "server\valheim_server.exe"
$LogFile = Join-Path $WorkingDir "server.log"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "            VALHEIM DEDICATED SERVER LAUNCHER             " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Verify server executable exists
if (-not (Test-Path $ServerExe)) {
    Write-Warning "valheim_server.exe not found! Running setup..."
    & (Join-Path $WorkingDir "setup_server.ps1")
    if (-not (Test-Path $ServerExe)) {
        Write-Error "Server setup failed. Please check your internet connection."
        exit 1
    }
}

# 2. Load Configuration
if (-not (Test-Path $ConfigFile)) {
    Write-Error "Configuration file not found: $ConfigFile"
    exit 1
}

$config = Get-Content $ConfigFile -Raw | ConvertFrom-Json

$serverName = $config.serverName
$Host.UI.RawUI.WindowTitle = "Valheim Server - $serverName"
$worldName = $config.worldName
$password = $config.serverPassword
$port = $config.serverPort
$isPublic = $config.isPublic
$crossplay = if ($null -ne $config.crossplay) { [bool]$config.crossplay } else { $true }
$saveInterval = $config.saveInterval
$backups = $config.backups
$preset = $config.preset
$modifier = $config.modifier

# Validate password length
if ($password.Length -lt 5) {
    Write-Host "[ERROR] Password must be at least 5 characters long!" -ForegroundColor Red
    Write-Host "Please edit server_config.json and set a longer password." -ForegroundColor Yellow
    pause
    exit 1
}

# 3. Display Settings Summary
Write-Host " Server Name   : $serverName" -ForegroundColor White
Write-Host " World Name    : $worldName" -ForegroundColor White
Write-Host " Server Port   : $port (UDP 2456-2457)" -ForegroundColor White
Write-Host " Password      : $password" -ForegroundColor White
Write-Host " Crossplay     : $(if ($crossplay) { 'ENABLED (PlayFab Join Code)' } else { 'DISABLED (Direct IP only)' })" -ForegroundColor $(if ($crossplay) { 'Green' } else { 'Yellow' })
Write-Host " Save Directory: $WorkingDir\worlds_local" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Starting Valheim Dedicated Server..." -ForegroundColor Green
Write-Host "Press Ctrl+C anytime to stop the server.`n" -ForegroundColor Gray

# 4. Build Launch Arguments
$env:SteamAppId = "892970"

$argsList = @(
    "-nographics",
    "-batchmode",
    "-name", "`"$serverName`"",
    "-port", $port,
    "-world", "`"$worldName`"",
    "-password", "`"$password`"",
    "-savedir", "`"$WorkingDir`"",
    "-public", $isPublic,
    "-saveinterval", $saveInterval,
    "-backups", $backups,
    "-logFile", "`"$LogFile`""
)

if ($crossplay) {
    $argsList += "-crossplay"
}

if (-not [string]::IsNullOrWhiteSpace($preset)) {
    $argsList += @("-preset", $preset)
}

if (-not [string]::IsNullOrWhiteSpace($modifier)) {
    $argsList += @("-modifier", $modifier)
}

# Clear old log
if (Test-Path $LogFile) {
    Remove-Item $LogFile -Force -ErrorAction SilentlyContinue
}

# 5. Start Server Process
$argString = $argsList -join " "
$process = Start-Process -FilePath $ServerExe -ArgumentList $argString -PassThru -NoNewWindow

# 6. Stream log output in real-time
$logPosition = 0
$joinCodePrinted = $false
$connectedPrinted = $false

try {
    while (-not $process.HasExited) {
        if (Test-Path $LogFile) {
            $stream = [System.IO.File]::Open($LogFile, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
            if ($stream.Length -gt $logPosition) {
                $stream.Seek($logPosition, [System.IO.SeekOrigin]::Begin) | Out-Null
                $reader = New-Object System.IO.StreamReader($stream)
                while (-not $reader.EndOfStream) {
                    $line = $reader.ReadLine()
                    
                    # Highlight important server events
                    if ($line -match "Session `"[^`"]+`" registered with join code\s+(\d+)") {
                        $joinCode = $Matches[1]
                        Write-Host "`n>>> PLAYFAB JOIN CODE: $joinCode <<<`n" -ForegroundColor Green
                        $joinCodePrinted = $true
                    } elseif ($line -match "Game server connected") {
                        Write-Host "`n>>> SERVER IS READY AND ONLINE! <<<`n" -ForegroundColor Green
                        $connectedPrinted = $true
                    } elseif ($line -match "Error|Exception" -and $line -notmatch "Shader") {
                        Write-Host $line -ForegroundColor Red
                    } else {
                        Write-Host $line -ForegroundColor Gray
                    }
                }
                $logPosition = $stream.Position
                $reader.Dispose()
            }
            $stream.Dispose()
        }
        Start-Sleep -Milliseconds 500
    }
} finally {
    if (-not $process.HasExited) {
        Write-Host "`nStopping server process..." -ForegroundColor Yellow
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Server has shut down." -ForegroundColor Red
}
