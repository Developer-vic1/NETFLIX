$ErrorActionPreference = 'Stop'
$filmCatalog = Get-Content -LiteralPath 'assets/catalog-sources.json' -Raw | ConvertFrom-Json
foreach ($film in $filmCatalog) {
  if ($film.id -notmatch '^[a-z0-9-]+$') { throw 'Invalid catalog identifier' }
  if ($film.localAsset) {
    if (-not (Test-Path -LiteralPath $film.localAsset)) { Write-Warning "$($film.name): copy the original local file using scripts/import-local-video.ps1" }
    else { Write-Output "$($film.name): original local file available" }
    continue
  }
  $source = $film.qualities | Where-Object quality -eq '360p' | Select-Object -First 1
  if (-not $source) { $source = $film.qualities | Select-Object -First 1 }
  if ([uri]::new($source.url).Host -ne 'video.blender.org') { throw 'Unapproved media source' }
  $fileName = if ($film.id -eq 'sintel') { 'sintel-full-360p.mp4' } else { "$($film.id)-$($source.quality).mp4" }
  $destination = Join-Path 'assets/videos' $fileName
  if ((Test-Path -LiteralPath $destination) -and (Get-Item -LiteralPath $destination).Length -eq $source.bytes) { Write-Output "$($film.name): already available"; continue }
  Invoke-WebRequest -Uri $source.url -OutFile "$destination.part"
  if ((Get-Item -LiteralPath "$destination.part").Length -ne $source.bytes) { throw "Unexpected media size: $($film.id)" }
  Move-Item -LiteralPath "$destination.part" -Destination $destination -Force
  Write-Output "$($film.name): $($source.quality) available"
}
