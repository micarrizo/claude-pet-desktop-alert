# Dado el id de la sesion de Claude Code (el nombre del transcript), devuelve en JSON el id de la
# sesion en la app de escritorio (local_...) y su titulo, leidos de los metadatos que guarda la app.
# Lo usa el mod Hoppy para mostrar el titulo del chat y para que el clic abra ese chat.
# Salida: {"id":"local_...","titulo":"..."} o {} si no la encuentra. Solo ASCII (\uXXXX), para no
# depender de la codificacion de la consola.
param([Parameter(Mandatory = $true)][string]$Cli)
$ErrorActionPreference = 'Stop'

function Escribir-Json($obj) {
    $json = $obj | ConvertTo-Json -Compress
    $sb = New-Object System.Text.StringBuilder
    foreach ($c in $json.ToCharArray()) {
        if ([int]$c -gt 126) { [void]$sb.AppendFormat('\u{0:x4}', [int]$c) } else { [void]$sb.Append($c) }
    }
    [Console]::Out.Write($sb.ToString())
}

if ($Cli -notmatch '^[A-Za-z0-9-]{8,64}$') { Escribir-Json @{}; exit 0 }

# La app de la Microsoft Store guarda sus datos en Claude-Data\claude_<paquete>; el instalador clasico, en Roaming\Claude.
$raices = @()
$raices += Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA 'Claude-Data') -Directory -Filter 'claude_*' -ErrorAction SilentlyContinue |
    ForEach-Object { Join-Path $_.FullName 'claude-code-sessions' }
$raices += Join-Path $env:APPDATA 'Claude\claude-code-sessions'
$raices = $raices | Where-Object { Test-Path $_ }

$aguja = '"cliSessionId":"' + $Cli + '"'
$archivos = @($raices | ForEach-Object { Get-ChildItem -Path $_ -Recurse -File -Filter 'local_*.json' -ErrorAction SilentlyContinue })

# El cliSessionId va entre los primeros campos: basta leer el comienzo de cada archivo.
$hallado = $null
$buffer = New-Object byte[] 1024
foreach ($a in ($archivos | Sort-Object LastWriteTime -Descending)) {
    try {
        $fs = [System.IO.File]::Open($a.FullName, 'Open', 'Read', 'ReadWrite')
        try { $n = $fs.Read($buffer, 0, $buffer.Length) } finally { $fs.Dispose() }
        if ([System.Text.Encoding]::UTF8.GetString($buffer, 0, $n).Contains($aguja)) { $hallado = $a; break }
    } catch {}
}
# Sesion retomada: el id nuevo queda en lastAssistantCliSessionId, mas adentro del archivo.
if (-not $hallado) {
    $m = $archivos | Select-String -SimpleMatch -List -Pattern ('"lastAssistantCliSessionId":"' + $Cli + '"') -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($m) { $hallado = Get-Item $m.Path }
}
if (-not $hallado) { Escribir-Json @{}; exit 0 }

$texto = [System.IO.File]::ReadAllText($hallado.FullName, [System.Text.Encoding]::UTF8)
$id = ''
$titulo = ''
try {
    $d = $texto | ConvertFrom-Json
    $id = [string]$d.sessionId
    $titulo = [string]$d.title
} catch {
    if ($texto -match '^\{"sessionId":"(local_[A-Za-z0-9-]+)"') { $id = $Matches[1] }
}
if ($id -notmatch '^local_[A-Za-z0-9-]{1,64}$') { $id = '' }
$titulo = ($titulo -replace '\s+', ' ').Trim()
Escribir-Json @{ id = $id; titulo = $titulo }
