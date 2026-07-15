$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$venv = Join-Path $root '.tools\rembg-venv'
$modelDir = Join-Path $root '.tools\rembg-models'
$python = Join-Path $venv 'Scripts\python.exe'

if (-not (Test-Path -LiteralPath $python)) {
  python -m venv $venv
}
& $python -m pip install (Join-Path $root 'vendor\rembg[cpu]')
$env:U2NET_HOME = $modelDir
New-Item -ItemType Directory -Force -Path $modelDir | Out-Null
& $python -c "from rembg import new_session; new_session('birefnet-general-lite', providers=['CPUExecutionProvider'])"

$expected = '5600024376F572A557870A5EB0AFB1E5961636BEF4E1E22132025467D0F03333'
$model = Join-Path $modelDir 'birefnet-general-lite.onnx'
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $model).Hash
if ($actual -ne $expected) { throw "BiRefNet model SHA256 mismatch: $actual" }
Write-Output "BiRefNet runtime ready: $model"
