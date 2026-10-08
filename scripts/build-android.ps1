param(
    [string]$SdkPath = "$env:LOCALAPPDATA\Android\Sdk",
    [string]$JdkPath = 'C:\Program Files\Android\Android Studio\jbr'
)
$ErrorActionPreference = 'Stop'
$projectPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$nativePath = Join-Path $projectPath 'android-local'
$buildPath = Join-Path $nativePath 'build'
$javaPath = Join-Path $JdkPath 'bin/java.exe'
$javacPath = Join-Path $JdkPath 'bin/javac.exe'
$keytoolPath = Join-Path $JdkPath 'bin/keytool.exe'
$toolsPath = Join-Path $SdkPath 'build-tools/35.0.0'
$androidJar = Join-Path $SdkPath 'platforms/android-35/android.jar'
foreach ($requiredPath in @($javaPath,$javacPath,$keytoolPath,$androidJar,(Join-Path $toolsPath 'aapt2.exe'))) {
    if (!(Test-Path -LiteralPath $requiredPath)) { throw "Falta una herramienta: $requiredPath. Revisa -SdkPath y -JdkPath." }
}
foreach ($generatedName in @('classes','dex','generated','assets')) {
    $generatedPath = [IO.Path]::GetFullPath((Join-Path $buildPath $generatedName))
    if ([IO.Path]::GetDirectoryName($generatedPath) -ne [IO.Path]::GetFullPath($buildPath) -or
        !$generatedPath.StartsWith($projectPath + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {
        throw 'Directorio de compilacion fuera del proyecto.'
    }
    if (Test-Path -LiteralPath $generatedPath) { Remove-Item -LiteralPath $generatedPath -Recurse -Force }
}
function Run-Native([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Error de compilación: $Program ($LASTEXITCODE)" }
}
foreach ($folderPath in @($buildPath,(Join-Path $buildPath 'classes'),(Join-Path $buildPath 'dex'),(Join-Path $buildPath 'generated'),(Join-Path $nativePath '.keys'),(Join-Path $projectPath 'releases'))) {
    New-Item -ItemType Directory -Path $folderPath -Force | Out-Null
}
Push-Location -LiteralPath $projectPath
try {
    Run-Native 'node.exe' @('android-local/prepare-web.mjs',(Join-Path $buildPath 'assets/www'))
    $resourceZip = Join-Path $buildPath 'resources.zip'
    Run-Native (Join-Path $toolsPath 'aapt2.exe') @('compile','--dir',(Join-Path $nativePath 'res'),'-o',$resourceZip)
    $unsignedApk = Join-Path $buildPath 'unsigned.apk'
    Run-Native (Join-Path $toolsPath 'aapt2.exe') @('link','-o',$unsignedApk,'-I',$androidJar,'--manifest',(Join-Path $nativePath 'AndroidManifest.xml'),'--java',(Join-Path $buildPath 'generated'),'-A',(Join-Path $buildPath 'assets'),'--min-sdk-version','26','--target-sdk-version','35',$resourceZip)
    $sourcePaths = @((Get-ChildItem -LiteralPath (Join-Path $nativePath 'src') -Recurse -Filter '*.java').FullName) + @((Get-ChildItem -LiteralPath (Join-Path $buildPath 'generated') -Recurse -Filter '*.java').FullName)
    Run-Native $javacPath (@('-encoding','UTF-8','-source','8','-target','8','-classpath',$androidJar,'-d',(Join-Path $buildPath 'classes')) + $sourcePaths)
    $classPaths = @((Get-ChildItem -LiteralPath (Join-Path $buildPath 'classes') -Recurse -Filter '*.class').FullName)
    Run-Native $javaPath (@('-cp',(Join-Path $toolsPath 'lib/d8.jar'),'com.android.tools.r8.D8','--lib',$androidJar,'--min-api','26','--output',(Join-Path $buildPath 'dex')) + $classPaths)
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::Open($unsignedApk, [IO.Compression.ZipArchiveMode]::Update)
    try {
        foreach ($dexFile in (Get-ChildItem -LiteralPath (Join-Path $buildPath 'dex') -Filter '*.dex')) {
            $oldEntry = $archive.GetEntry($dexFile.Name)
            if ($oldEntry) { $oldEntry.Delete() }
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$dexFile.FullName,$dexFile.Name,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally { $archive.Dispose() }
    $alignedApk = Join-Path $buildPath 'aligned.apk'
    Run-Native (Join-Path $toolsPath 'zipalign.exe') @('-f','-p','4',$unsignedApk,$alignedApk)
    $keyPath = Join-Path $nativePath '.keys/android-local.jks'
    if (!(Test-Path -LiteralPath $keyPath)) {
        Run-Native $keytoolPath @('-genkeypair','-keystore',$keyPath,'-storepass','android','-keypass','android','-alias','androiddebugkey','-dname','CN=Android Local Development','-keyalg','RSA','-keysize','2048','-validity','10000')
    }
    $apkPath = Join-Path $projectPath 'releases/Netflix-Android.apk'
    $signerJar = Join-Path $toolsPath 'lib/apksigner.jar'
    Run-Native $javaPath @('-jar',$signerJar,'sign','--v4-signing-enabled','false','--ks',$keyPath,'--ks-pass','pass:android','--key-pass','pass:android','--out',$apkPath,$alignedApk)
    Run-Native $javaPath @('-jar',$signerJar,'verify','--verbose',$apkPath)
    Get-FileHash -LiteralPath $apkPath -Algorithm SHA256 | Format-List
    Write-Output "APK lista: $apkPath (Android 8 o superior; biblioteca transferida aparte)."
} finally { Pop-Location }
