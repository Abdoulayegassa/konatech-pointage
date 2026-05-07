[CmdletBinding()]
param(
  [switch]$KillDevServers,
  [switch]$RegeneratePrisma
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pathsToRemove = @(
  (Join-Path $repoRoot 'apps\backend\dist'),
  (Join-Path $repoRoot 'apps\frontend\.next')
)
$devPorts = @(3000, 3001, 3100, 4000, 4001, 4100)

function Remove-ProjectPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$TargetPath
  )

  if (Test-Path -LiteralPath $TargetPath) {
    Remove-Item -LiteralPath $TargetPath -Recurse -Force
    Write-Host "Removed $TargetPath"
    return
  }

  Write-Host "Skipped missing path $TargetPath"
}

function Stop-DevServerProcesses {
  $stoppedPids = New-Object System.Collections.Generic.HashSet[int]

  foreach ($port in $devPorts) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue

    foreach ($connection in $connections) {
      if (-not $stoppedPids.Add($connection.OwningProcess)) {
        continue
      }

      try {
        Stop-Process -Id $connection.OwningProcess -Force -ErrorAction Stop
        Write-Host "Stopped process $($connection.OwningProcess) on port $port"
      } catch {
        Write-Warning "Unable to stop process $($connection.OwningProcess) on port $port. $($_.Exception.Message)"
      }
    }
  }

  if ($stoppedPids.Count -eq 0) {
    Write-Host 'No frontend/backend dev server processes were listening on validation ports.'
  }
}

if ($KillDevServers) {
  Stop-DevServerProcesses
}

foreach ($targetPath in $pathsToRemove) {
  Remove-ProjectPath -TargetPath $targetPath
}

Get-ChildItem -Path $repoRoot -Filter *.tsbuildinfo -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch '\\node_modules\\' } |
  ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Force
    Write-Host "Removed $($_.FullName)"
  }

if ($RegeneratePrisma) {
  $prismaCli = Join-Path $repoRoot 'apps\backend\node_modules\prisma\build\index.js'
  $backendRoot = Join-Path $repoRoot 'apps\backend'

  if (-not (Test-Path -LiteralPath $prismaCli)) {
    throw 'Prisma CLI was not found. Run pnpm install before requesting Prisma regeneration.'
  }

  Push-Location $backendRoot

  try {
    & node $prismaCli generate
  } finally {
    Pop-Location
  }

  if ($LASTEXITCODE -ne 0) {
    throw 'Prisma client regeneration failed.'
  }
}

Write-Host 'Windows cleanup completed.'
