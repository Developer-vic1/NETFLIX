param(
    [Parameter(Mandatory=$true)][string]$PythonPath,
    [ValidateRange(1024,65535)][int]$Port = 4184,
    [switch]$CheckOnly,
    [switch]$Elevated
)
$ErrorActionPreference = 'Stop'
$program = [IO.Path]::GetFullPath($PythonPath)
if (-not (Test-Path -LiteralPath $program -PathType Leaf) -or [IO.Path]::GetExtension($program) -ne '.exe') {
    throw 'No se encuentra el ejecutable Python que compartira la biblioteca.'
}
$ruleName = "NetflixLocal-WiFi-TCP-$Port"
function Test-NetflixRule {
    $existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
    if (-not $existing) { return $false }
    $application = $existing | Get-NetFirewallApplicationFilter
    $ports = $existing | Get-NetFirewallPortFilter
    $addresses = $existing | Get-NetFirewallAddressFilter
    return $existing.Enabled.ToString() -eq 'True' -and $existing.Profile.ToString() -eq 'Private' -and
        $existing.Action.ToString() -eq 'Allow' -and $existing.Direction.ToString() -eq 'Inbound' -and
        $application.Program -eq $program -and $ports.LocalPort -eq $Port.ToString() -and
        $ports.Protocol.ToString() -eq 'TCP' -and @($addresses.RemoteAddress).Count -eq 1 -and
        @($addresses.RemoteAddress)[0] -eq 'LocalSubnet'
}
if (Test-NetflixRule) { Write-Output "Wi-Fi autorizada en red privada para Python TCP $Port."; exit 0 }
if ($CheckOnly) { Write-Output "Falta la autorizacion privada de Netflix TCP $Port."; exit 2 }
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    if ($Elevated) { throw 'Windows no concedio privilegios de administrador.' }
    Write-Output "Windows pedira permiso: habilitar solo Python TCP $Port, redes privadas, equipos de la subred local."
    # Windows owns the confirmation. No prompt or security setting is clicked automatically.
    $arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -PythonPath "' + $program + '" -Port ' + $Port + ' -Elevated'
    try {
        $child = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -PassThru -Wait
        if ($child.ExitCode -ne 0 -or -not (Test-NetflixRule)) { throw 'Windows no confirmo la regla de conexion.' }
    } catch {
        Write-Error 'No se autorizo la conexion privada. Vuelve a abrir Compartir-WiFi.bat y acepta el permiso de Windows para compartir.'
        exit 1
    }
    Write-Output 'Permiso privado configurado. No se desactivo el firewall.'
    exit 0
}
$existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
if ($existing) {
    Set-NetFirewallRule -Name $ruleName -Program $program -Protocol TCP -LocalPort $Port -Profile Private -Direction Inbound -Action Allow -Enabled True -RemoteAddress LocalSubnet | Out-Null
} else {
    New-NetFirewallRule -Name $ruleName -DisplayName "Netflix Local Wi-Fi TCP $Port" -Description 'Netflix Local: biblioteca autenticada, Python, red privada y subred local.' -Program $program -Protocol TCP -LocalPort $Port -Profile Private -Direction Inbound -Action Allow -Enabled True -RemoteAddress LocalSubnet | Out-Null
}
if (-not (Test-NetflixRule)) { throw 'No se pudo verificar la autorizacion privada.' }
Write-Output "Conexion privada configurada para TCP $Port."
