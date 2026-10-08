param(
    [string]$SdkRoot = "$env:LOCALAPPDATA\Android\Sdk",
    [string]$JdkRoot = 'C:\Program Files\Android\Android Studio\jbr',
    [switch]$Run,
    [string]$Serial,
    [string]$Address,
    [string]$Code
)
$ErrorActionPreference = 'Stop'
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$outputPath = Join-Path $repository 'output\android-device-check'
$classesPath = Join-Path $outputPath 'classes'
$dexPath = Join-Path $outputPath 'dex'
$targetClasses = Join-Path $repository 'android-local\build\classes'
$androidJar = Join-Path $SdkRoot 'platforms\android-35\android.jar'
$tools = Join-Path $SdkRoot 'build-tools\35.0.0'
$java = Join-Path $JdkRoot 'bin\java.exe'
$compiler = Join-Path $JdkRoot 'bin\javac.exe'
$keyPath = Join-Path $repository 'android-local\.keys\android-local.jks'
$adb = Join-Path $SdkRoot 'platform-tools\adb.exe'
foreach ($path in @($androidJar, $java, $compiler, $keyPath, (Join-Path $tools 'aapt2.exe'), (Join-Path $targetClasses 'com\netflix\local\WifiLibrarySync.class'))) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Missing required build input: $path. Build the main Android APK first." }
}
if ($Run -and (!$Serial -or !$Address -or $Code -notmatch '^[0-9]{6}$')) { throw '-Run requires -Serial, -Address and a six-digit -Code.' }
function Invoke-Native([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Native command failed: $Program ($LASTEXITCODE)" }
}
foreach ($folder in @($outputPath, $classesPath, $dexPath)) { New-Item -ItemType Directory -Force -Path $folder | Out-Null }
$unsigned = Join-Path $outputPath 'unsigned.apk'
$aligned = Join-Path $outputPath 'aligned.apk'
$apk = Join-Path $outputPath 'Netflix-Wifi-Check.apk'
Invoke-Native (Join-Path $tools 'aapt2.exe') @('link', '-o', $unsigned, '-I', $androidJar, '--manifest', (Join-Path $PSScriptRoot 'AndroidManifest.xml'), '--min-sdk-version', '26', '--target-sdk-version', '35')
Invoke-Native $compiler @('-source', '8', '-target', '8', '-Xlint:-options', '-encoding', 'UTF-8', '-classpath', "$androidJar;$targetClasses", '-d', $classesPath, (Join-Path $PSScriptRoot 'SmokeInstrumentation.java'))
$classFiles = @((Get-ChildItem -LiteralPath $classesPath -Filter '*.class' -Recurse).FullName)
Invoke-Native $java (@('-cp', (Join-Path $tools 'lib\d8.jar'), 'com.android.tools.r8.D8', '--lib', $androidJar, '--classpath', $targetClasses, '--min-api', '26', '--output', $dexPath) + $classFiles)
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::Open($unsigned, [IO.Compression.ZipArchiveMode]::Update)
try {
    foreach ($dex in (Get-ChildItem -LiteralPath $dexPath -Filter '*.dex')) {
        $previous = $archive.GetEntry($dex.Name)
        if ($previous) { $previous.Delete() }
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $dex.FullName, $dex.Name, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally { $archive.Dispose() }
Invoke-Native (Join-Path $tools 'zipalign.exe') @('-f', '-p', '4', $unsigned, $aligned)
Invoke-Native $java @('-jar', (Join-Path $tools 'lib\apksigner.jar'), 'sign', '--v4-signing-enabled', 'false', '--ks', $keyPath, '--ks-pass', 'pass:android', '--key-pass', 'pass:android', '--out', $apk, $aligned)
Invoke-Native $java @('-jar', (Join-Path $tools 'lib\apksigner.jar'), 'verify', $apk)
Write-Output "Instrumentation APK built: $apk"
if ($Run) {
    Invoke-Native $adb @('-s', $Serial, 'install', '-r', $apk)
    $testOutput = & $adb -s $Serial shell am instrument -w -r -e address $Address -e code $Code 'com.netflix.local.check/com.netflix.local.SmokeInstrumentation' 2>&1
    $testExit = $LASTEXITCODE
    $testOutput | ForEach-Object { Write-Output $_ }
    if ($testExit -ne 0 -or (($testOutput -join "`n") -notmatch 'INSTRUMENTATION_RESULT: STATUS=passed') -or (($testOutput -join "`n") -notmatch 'INSTRUMENTATION_CODE: -1')) {
        throw 'Physical Android Wi-Fi instrumentation checks failed.'
    }
}
