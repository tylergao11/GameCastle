param(
  [ValidateSet('Start', 'Stop', 'Status')]
  [string]$Action = 'Status'
)

$ErrorActionPreference = 'Stop'
# scripts/assets -> repo root is two parents up
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$workspaceRoot = Split-Path -Parent $projectRoot
$portableRoot = Join-Path $workspaceRoot 'ComfyUI_windows_portable'
$defaultRoot = Join-Path $portableRoot 'ComfyUI'
$comfyRoot = if ($env:COMFYUI_ROOT) {
  if ([IO.Path]::IsPathRooted($env:COMFYUI_ROOT)) { [IO.Path]::GetFullPath($env:COMFYUI_ROOT) }
  else { [IO.Path]::GetFullPath((Join-Path $projectRoot $env:COMFYUI_ROOT)) }
} else { $defaultRoot }
$embeddedPython = Join-Path $portableRoot 'python_embeded\python.exe'
$venvPython = Join-Path $comfyRoot '.venv\Scripts\python.exe'
$python = if (Test-Path $embeddedPython) { $embeddedPython } elseif (Test-Path $venvPython) { $venvPython } else { $embeddedPython }
$pidFile = Join-Path $projectRoot '.gamecastle\comfyui.pid'
$endpoint = if ($env:COMFYUI_ENDPOINT) { $env:COMFYUI_ENDPOINT.TrimEnd('/') } else { 'http://127.0.0.1:8188' }

function Get-ComfyProcess {
  if (-not (Test-Path $pidFile)) { return $null }
  $id = [int](Get-Content -Raw $pidFile)
  return Get-Process -Id $id -ErrorAction SilentlyContinue
}
function Test-ComfyHealth {
  try { return (Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "$endpoint/system_stats").StatusCode -eq 200 } catch { return $false }
}

if ($Action -eq 'Status') {
  [PSCustomObject]@{ root = $comfyRoot; endpoint = $endpoint; processRunning = [bool](Get-ComfyProcess); healthy = Test-ComfyHealth } | Format-List
  exit
}
if ($Action -eq 'Stop') {
  $process = Get-ComfyProcess
  if ($process) { Stop-Process -Id $process.Id -Force; Remove-Item -LiteralPath $pidFile -Force }
  Write-Output 'ComfyUI stopped.'
  exit
}
if (Test-ComfyHealth) { Write-Output "ComfyUI is already healthy at $endpoint"; exit }
if (-not (Test-Path $python)) { throw "ComfyUI environment is missing: $python. Finish the installation under $comfyRoot first." }
New-Item -ItemType Directory -Path (Split-Path -Parent $pidFile) -Force | Out-Null
$stdoutLog = Join-Path $projectRoot '.gamecastle\comfyui.stdout.log'
$stderrLog = Join-Path $projectRoot '.gamecastle\comfyui.stderr.log'
$process = Start-Process -FilePath $python -ArgumentList @('-s', 'main.py', '--windows-standalone-build', '--listen', '127.0.0.1', '--port', '8188', '--disable-auto-launch') -WorkingDirectory $comfyRoot -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -WindowStyle Hidden -PassThru
Set-Content -LiteralPath $pidFile -Value $process.Id -NoNewline
for ($attempt = 0; $attempt -lt 30; $attempt++) { Start-Sleep -Seconds 1; if (Test-ComfyHealth) { Write-Output "ComfyUI ready at $endpoint"; exit } }
throw "ComfyUI did not become healthy. Inspect $stdoutLog and $stderrLog"
