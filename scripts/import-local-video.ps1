param([string]$Source)
$ErrorActionPreference = 'Stop'
if (-not $Source) {
  $mediaDirectory = 'CREACI' + [char]0x00D3 + 'N DE VIDEOS'
  $Source = Join-Path (Join-Path ([Environment]::GetFolderPath('Desktop')) $mediaDirectory) 'SPIDERMAN BRAND NEW DAY.mp4'
}
$sourceFile = Get-Item -LiteralPath $Source
if ($sourceFile.Extension -ne '.mp4') { throw 'An MP4 file is required.' }
$projectRoot = Split-Path -Parent $PSScriptRoot
$destination = Join-Path $projectRoot 'assets/videos/spiderman-brand-new-day-original.mp4'
New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
if ($sourceFile.FullName -ne $destination) { Copy-Item -LiteralPath $sourceFile.FullName -Destination $destination -Force }
$originalHash = (Get-FileHash -LiteralPath $sourceFile.FullName -Algorithm SHA256).Hash
$copiedHash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
if ($originalHash -ne $copiedHash) { throw 'The copied file differs from the original.' }
Write-Output 'Full original copied and SHA256 verified. No trimming or transcoding.'
