$ErrorActionPreference = 'Stop'

$docker = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
$compose = Join-Path $PSScriptRoot 'docker-compose.semantic-llm.yml'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw 'Docker CLI is not installed or is not on PATH.'
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  if (-not (Test-Path -LiteralPath $docker)) {
    throw 'Docker Desktop is installed but its executable was not found.'
  }
  Start-Process -FilePath $docker -WindowStyle Hidden
  $deadline = (Get-Date).AddMinutes(2)
  do {
    Start-Sleep -Seconds 2
    docker info *> $null
  } while ($LASTEXITCODE -ne 0 -and (Get-Date) -lt $deadline)
  if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop did not become ready within two minutes.' }
}

docker volume inspect gamecastle-llm-cache *> $null
if ($LASTEXITCODE -ne 0) {
  docker volume create gamecastle-llm-cache | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'The persistent semantic model cache volume could not be created.' }
}

docker compose -f $compose up -d
if ($LASTEXITCODE -ne 0) { throw 'The semantic model container failed to start.' }

Write-Host 'Semantic LLM is starting at http://127.0.0.1:8002/v1'
Write-Host 'The first start downloads the model into the persistent gamecastle-llm-cache volume.'
