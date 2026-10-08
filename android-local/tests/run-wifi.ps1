param(
    [string]$SdkRoot = "$env:LOCALAPPDATA\Android\Sdk",
    [string]$JdkRoot = 'C:\Program Files\Android\Android Studio\jbr',
    [int]$ApiLevel = 35
)
$ErrorActionPreference = 'Stop'
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$androidJar = Join-Path $SdkRoot "platforms\android-$ApiLevel\android.jar"
$compiler = Join-Path $JdkRoot 'bin\javac.exe'
$java = Join-Path $JdkRoot 'bin\java.exe'
foreach ($requiredFile in @($androidJar, $compiler, $java)) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) { throw "Missing Android/JDK tool: $requiredFile" }
}
$classes = Join-Path $repository 'output\android-native-tests'
New-Item -ItemType Directory -Force -Path $classes | Out-Null
$sources = @(
    (Join-Path $repository 'android-local\src\com\netflix\local\LibraryAccess.java'),
    (Join-Path $repository 'android-local\src\com\netflix\local\WifiLibrarySync.java'),
    (Join-Path $PSScriptRoot 'com\netflix\local\WifiSyncCheck.java')
)
& $compiler -source 8 -target 8 '-Xlint:-options' -encoding UTF-8 -classpath $androidJar -d $classes $sources
if ($LASTEXITCODE -ne 0) { throw 'Native Wi-Fi test compilation failed.' }
& $java -classpath "$classes;$androidJar" com.netflix.local.WifiSyncCheck
if ($LASTEXITCODE -ne 0) { throw 'Native Wi-Fi boundary checks failed.' }
