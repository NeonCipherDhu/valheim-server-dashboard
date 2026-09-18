# open_firewall_ports.ps1
# Adds inbound Windows Defender Firewall rules for Valheim Dedicated Server (UDP 2456-2457)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "Requesting Administrator privileges to add Firewall rule..." -ForegroundColor Yellow
    Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

Write-Host "Adding Windows Firewall rules for Valheim Dedicated Server..." -ForegroundColor Cyan

try {
    # Remove existing rules if any
    Remove-NetFirewallRule -DisplayName "Valheim Dedicated Server (UDP 2456-2457)" -ErrorAction SilentlyContinue

    New-NetFirewallRule -DisplayName "Valheim Dedicated Server (UDP 2456-2457)" `
        -Direction Inbound `
        -Protocol UDP `
        -LocalPort 2456,2457 `
        -Action Allow `
        -Description "Inbound port rule for Valheim Dedicated Server" `
        -Profile Any | Out-Null

    Write-Host "Success! Firewall rule 'Valheim Dedicated Server (UDP 2456-2457)' created successfully." -ForegroundColor Green
} catch {
    Write-Error "Failed to add firewall rule: $_"
}

Write-Host "`nPress any key to close..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
