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
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        throw "No se encuentra $requiredFile. Indica -SdkRoot y -JdkRoot para tu instalación."
    }
}
$classes = Join-Path $repository 'output\android-native-tests'
New-Item -ItemType Directory -Force -Path $classes | Out-Null
$sources = @(
    (Join-Path $repository 'android-local\src\com\netflix\local\LibraryAccess.java'),
    (Join-Path $repository 'android-local\src\com\netflix\local\LocalMediaServer.java'),
    (Join-Path $PSScriptRoot 'com\netflix\local\RuntimeRangeCheck.java')
)
& $compiler -source 8 -target 8 '-Xlint:-options' -encoding UTF-8 -classpath $androidJar -d $classes $sources
if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación de las pruebas nativas.' }
& $java -classpath "$classes;$androidJar" com.netflix.local.RuntimeRangeCheck
if ($LASTEXITCODE -ne 0) { throw 'Falló la validación de rangos o rutas.' }
