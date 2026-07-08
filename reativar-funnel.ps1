# ============================================================
#  Reativa o Tailscale Funnel (link publico de acesso remoto).
#
#  Roda no boot ANTES do servidor. Corrige o problema de o link
#  publico "sumir" da internet quando o PC reinicia.
#
#  IMPORTANTE: so' faz o "reset" (que tira o link do ar por alguns
#  segundos) se o nome REALMENTE nao estiver resolvendo na internet
#  publica. Se ja estiver no ar, apenas garante que o funnel esta
#  ligado — sem downtime, evitando que algum celular guarde em cache
#  o "nao existe" (NXDOMAIN).
# ============================================================

$ts = "C:\Program Files\Tailscale\tailscale.exe"

if (-not (Test-Path $ts)) {
  Write-Host "Tailscale nao encontrado em $ts - pulando reativacao do link remoto."
  exit 0
}

# 1) Espera o Tailscale conectar (ate ~2 minutos).
Write-Host "Aguardando o Tailscale conectar..."
$st = $null
for ($i = 0; $i -lt 60; $i++) {
  try {
    $st = & $ts status --json 2>$null | ConvertFrom-Json
    if ($st.BackendState -eq "Running" -and $st.Self.Online) { break }
  } catch {}
  Start-Sleep -Seconds 2
}

if (-not ($st -and $st.BackendState -eq "Running" -and $st.Self.Online)) {
  Write-Host "Tailscale nao conectou a tempo. O link remoto pode nao funcionar ate reativar manualmente."
  exit 0
}

$nome = ($st.Self.DNSName).TrimEnd('.')
Write-Host "Tailscale conectado. Nome publico: $nome"

# 2) Verifica se o nome ja resolve na INTERNET PUBLICA (via Google DoH, que
#    nao passa pelo DNS interno do Tailscale). Status 0 = existe; 3 = NXDOMAIN.
function Resolve-Publico($nome) {
  try {
    $r = Invoke-RestMethod -Uri "https://dns.google/resolve?name=$nome&type=A" -TimeoutSec 12
    return [int]$r.Status
  } catch { return -1 }
}

$status = Resolve-Publico $nome
Write-Host "DNS publico atual: status $status (0 = ja no ar)"

if ($status -eq 0) {
  # Ja esta publicado. So garante que o funnel esta ligado (idempotente, sem reset).
  & $ts funnel --bg 3000 2>&1 | Out-Null
  Write-Host "Link ja estava no ar - apenas confirmado. https://$nome/musico"
  exit 0
}

# 3) Nao esta resolvendo: forca a re-publicacao (reset + certificado + funnel).
Write-Host "Link fora do ar - re-registrando (Funnel)..."
& $ts funnel reset 2>&1 | Out-Null
Push-Location $env:TEMP
try { & $ts cert $nome 2>&1 | Out-Null } catch {}
Pop-Location
& $ts funnel --bg 3000 2>&1 | Out-Null

# 4) Espera confirmar que voltou ao ar (ate ~1 min).
for ($i = 0; $i -lt 10; $i++) {
  Start-Sleep -Seconds 6
  if ((Resolve-Publico $nome) -eq 0) {
    Write-Host "Link reativado e no ar: https://$nome/musico"
    exit 0
  }
}
Write-Host "Funnel reativado, aguardando propagacao do DNS: https://$nome/musico"
