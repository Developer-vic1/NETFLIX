param([string]$Source)
$ErrorActionPreference = 'Stop'
if (-not $Source) {
  $mediaDirectory = 'CREACI' + [char]0x00D3 + 'N DE VIDEOS'
  $Source = Join-Path (Join-Path ([Environment]::GetFolderPath('Desktop')) $mediaDirectory) 'SPIDERMAN BRAND NEW DAY.mp4'
}
& python (Join-Path $PSScriptRoot 'import-media.py') --source $Source --title 'Spider-Man: Brand New Day'
if ($LASTEXITCODE -ne 0) { throw 'No se pudo trasladar el MP4. Revisa la ruta y si el destino ya existe.' }
