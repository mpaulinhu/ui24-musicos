# ============================================================
#  Abre a tela do MONITOR (house mix) no segundo monitor,
#  automaticamente, em janela cheia sem barra de navegador.
#
#  Roda no boot, DEPOIS do servidor (precisa dele de pe).
# ============================================================

Add-Type -AssemblyName System.Windows.Forms

# Espera o servidor responder (ate ~1 minuto).
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    Invoke-WebRequest -Uri "http://localhost:3000/monitor" -UseBasicParsing -TimeoutSec 3 | Out-Null
    $ok = $true
    break
  } catch { Start-Sleep -Seconds 2 }
}
if (-not $ok) { exit 0 }

# Acha o segundo monitor (se nao tiver, usa o principal mesmo).
$telas = [System.Windows.Forms.Screen]::AllScreens
$tela = $telas | Where-Object { -not $_.Primary } | Select-Object -First 1
if (-not $tela) { $tela = $telas[0] }
$b = $tela.Bounds

# Acha o Chrome (ou Edge, se nao tiver Chrome).
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chrome)) { $chrome = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe" }
if (-not (Test-Path $chrome)) { $chrome = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" }
if (-not (Test-Path $chrome)) { exit 0 }

$args = @(
  "--app=http://localhost:3000/monitor"
  "--window-position=$($b.X),$($b.Y)"
  "--window-size=$($b.Width),$($b.Height)"
  "--start-fullscreen"
)
Start-Process -FilePath $chrome -ArgumentList $args
