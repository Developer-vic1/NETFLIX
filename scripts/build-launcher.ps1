$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Se requiere .NET Framework 4 para compilar el iniciador.' }
& $compiler /nologo /target:winexe /out:"$projectRoot\Netflix.exe" /reference:System.Windows.Forms.dll "$PSScriptRoot\NetflixLauncher.cs"
if ($LASTEXITCODE -ne 0) { throw 'No se pudo compilar Netflix.exe' }
Write-Host "Iniciador creado: $projectRoot\Netflix.exe"
