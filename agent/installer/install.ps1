# Obliview Agent Installer for Windows
# Compatible with PowerShell 3+ (Windows Server 2012+)
# Usage: Download via the Obliview admin panel, then right-click → Run with PowerShell (as Administrator)
# Or:    .\install.ps1 -ServerUrl "https://your-server" -ApiKey "<apikey>"

param(
    [string]$ServerUrl = "__SERVER_URL__",
    [string]$ApiKey = "__API_KEY__"
)

$ErrorActionPreference = "Stop"

$InstallDir = "C:\Program Files\ObliviewAgent"
$ConfigDir  = "$env:ProgramData\ObliviewAgent"
$ServiceName = "ObliviewAgent"
$NodeVersion = "18"
$NodeMsiUrl  = "https://nodejs.org/dist/v18.20.4/node-v18.20.4-x64.msi"

Write-Host "=============================="
Write-Host " Obliview Agent Installer"
Write-Host "=============================="
Write-Host "Server URL : $ServerUrl"
Write-Host "Install dir: $InstallDir"
Write-Host ""

# ── 1. Check / Install Node.js ────────────────────────────────────────────────

$NodePath = $null
$NodeExe = Get-Command "node.exe" -ErrorAction SilentlyContinue
if ($NodeExe) {
    $NodeMajor = (node --version) -replace 'v',''.Split('.')[0]
    Write-Host "[1/6] Node.js already installed: $(node --version)"
    $NodePath = $NodeExe.Source
} else {
    Write-Host "[1/6] Node.js not found, downloading installer..."
    $TempMsi = "$env:TEMP\nodejs_installer.msi"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $NodeMsiUrl -OutFile $TempMsi -UseBasicParsing
    Write-Host "Running Node.js MSI installer (silent)..."
    Start-Process msiexec.exe -Wait -ArgumentList "/i `"$TempMsi`" /qn /norestart ADDLOCAL=ALL"
    Remove-Item $TempMsi -Force -ErrorAction SilentlyContinue

    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path","User")

    $NodeExe = Get-Command "node.exe" -ErrorAction SilentlyContinue
    if (-not $NodeExe) {
        # Try common install locations
        $NodePath = "C:\Program Files\nodejs\node.exe"
        if (-not (Test-Path $NodePath)) {
            Write-Error "Node.js installation failed. Please install Node.js 18+ manually."
            exit 1
        }
    } else {
        $NodePath = $NodeExe.Source
    }
    Write-Host "Node.js installed successfully."
}

# ── 2. Create directories ─────────────────────────────────────────────────────

Write-Host "[2/6] Creating install directories..."
New-Item -ItemType Directory -Force -Path "$InstallDir\src" | Out-Null
New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null

# ── 3. Download agent files ───────────────────────────────────────────────────

Write-Host "[3/6] Downloading agent files..."
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri "$ServerUrl/api/agent/download/agent.js" `
    -OutFile "$InstallDir\src\index.js" -UseBasicParsing
Invoke-WebRequest -Uri "$ServerUrl/api/agent/download/package.json" `
    -OutFile "$InstallDir\package.json" -UseBasicParsing

# ── 4. Install npm dependencies ───────────────────────────────────────────────

Write-Host "[4/6] Installing npm dependencies..."
$NpmPath = Join-Path (Split-Path $NodePath) "npm.cmd"
if (-not (Test-Path $NpmPath)) {
    $NpmPath = "npm"
}
Set-Location $InstallDir
& $NpmPath install --production --silent

# ── 5. Write config ───────────────────────────────────────────────────────────

Write-Host "[5/6] Writing configuration..."
$Config = @{
    serverUrl            = $ServerUrl
    apiKey               = $ApiKey
    checkIntervalSeconds = 60
    agentVersion         = "1.0.0"
} | ConvertTo-Json
Set-Content -Path "$ConfigDir\config.json" -Value $Config -Encoding UTF8

# ── 6. Install Windows Service ────────────────────────────────────────────────

Write-Host "[6/6] Installing Windows Service..."

# Remove existing service if present
$Existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($Existing) {
    Write-Host "Stopping existing service..."
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    # PS 6+: Remove-Service; PS 3-5 fallback via WMI
    if (Get-Command Remove-Service -ErrorAction SilentlyContinue) {
        Remove-Service -Name $ServiceName
    } else {
        $wmiSvc = Get-WmiObject Win32_Service -Filter "Name='$ServiceName'"
        if ($wmiSvc) { $wmiSvc.Delete() | Out-Null }
    }
    Start-Sleep -Seconds 2
}

# Build the service binary path
$ServiceBinPath = "`"$NodePath`" `"$InstallDir\src\index.js`""

# Create service using PowerShell native cmdlet (avoids sc.exe create heuristics)
New-Service -Name $ServiceName `
    -BinaryPathName $ServiceBinPath `
    -DisplayName "Obliview Monitoring Agent" `
    -Description "Sends system metrics to the Obliview monitoring platform." `
    -StartupType Automatic | Out-Null

# Configure failure recovery actions
& sc.exe failure $ServiceName reset= 86400 actions= restart/10000/restart/10000/restart/30000 | Out-Null

# Start the service using PowerShell native cmdlet
Start-Service -Name $ServiceName

Start-Sleep -Seconds 3
$Service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($Service -and $Service.Status -eq "Running") {
    Write-Host "Service started successfully."
} else {
    Write-Warning "Service may not have started. Check Event Viewer for errors."
    Write-Host "To start manually: Start-Service -Name '$ServiceName'"
}

Write-Host ""
Write-Host "=============================="
Write-Host " Installation complete!"
Write-Host " The agent will appear in the"
Write-Host " Obliview admin panel once it"
Write-Host " makes its first connection."
Write-Host "=============================="
