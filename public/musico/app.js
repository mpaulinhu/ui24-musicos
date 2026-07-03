// ============================================================================
//  APP DO MUSICO
// ============================================================================
//  Conversa com o SEU servidor por WebSocket. Nunca fala direto com a mesa.
//  Fluxo: escolhe musico -> senha -> entra -> mexe nos faders do fone dele.
// ============================================================================

const $ = (sel) => document.querySelector(sel);

// Estado local
let ws = null;
let musico = null;            // dados do musico logado
let mesaConectada = false;
const fadersPorCanal = {};    // canal -> { range, valor, mute, btnMute }
let abaAtual = 'mix';
let naoLidas = 0;
let recebendoHistorico = false; // true logo apos login (mensagens antigas em rajada)
let timerHistorico = null;

// ---------------------------------------------------------------------------
//  Conexao WebSocket com o servidor
// ---------------------------------------------------------------------------
// Guarda as credenciais do ultimo login para refazer sozinho se cair a conexao.
let ultimoLogin = null; // { musicoId, senha }

function conectar() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.onopen = () => {
    setStatusMesa();
    // Se ja estavamos logados e a conexao caiu/reiniciou, faz login de novo
    // automaticamente. Assim o servidor volta a saber quem somos.
    if (ultimoLogin) {
      enviar({ tipo: 'login_musico', musicoId: ultimoLogin.musicoId, senha: ultimoLogin.senha });
    }
  };
  ws.onclose = () => {
    setStatusMesa('Servidor desconectado. Tentando reconectar…');
    setTimeout(conectar, 2000);
  };
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    tratar(msg);
  };
}

function enviar(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

// ---------------------------------------------------------------------------
//  Recebendo mensagens do servidor
// ---------------------------------------------------------------------------
function tratar(msg) {
  switch (msg.tipo) {
    case 'bemvindo':
      mesaConectada = msg.mesaConectada;
      setStatusMesa();
      break;

    case 'mesa_status':
      mesaConectada = msg.conectado;
      atualizarBadgeMesa();
      setStatusMesa();
      break;

    case 'login_ok':
      musico = msg.musico;
      entrarNoMixer();
      // Limpa o chat na tela. O servidor vai reenviar o historico do culto
      // logo em seguida (evita mensagens duplicadas ao reconectar).
      $('#chat-mensagens').innerHTML = '';
      zerarNaoLidas();
      // Marca que estamos recebendo o historico: por ~1s, as mensagens que
      // chegam sao antigas e nao devem contar como "nao lidas".
      recebendoHistorico = true;
      clearTimeout(timerHistorico);
      timerHistorico = setTimeout(() => { recebendoHistorico = false; }, 1000);
      break;

    case 'login_falhou':
      ultimoLogin = null; // evita ficar tentando com credencial invalida
      $('#login-erro').textContent = msg.motivo || 'Falha no login';
      break;

    case 'estado_canal':
      aplicarEstadoCanal(msg.canal, msg.nivel, msg.mix);
      break;

    case 'parametro':
      // Atualizacao vinda da mesa (pode ter sido outro musico/operador)
      if (msg.campo === 'value') aplicarNivel(msg.canal, msg.valor);
      if (msg.campo === 'mix') aplicarMix(msg.canal, msg.valor);
      break;

    case 'master':
      aplicarMaster(msg.valor);
      break;

    case 'chat':
      receberChat(msg);
      break;
  }
}

// ---------------------------------------------------------------------------
//  LOGIN
// ---------------------------------------------------------------------------
async function montarLogin() {
  const resp = await fetch('/api/config');
  const cfg = await resp.json();
  const sel = $('#sel-musico');
  sel.innerHTML = '';
  for (const m of cfg.musicos) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${m.nome} (fone ${m.aux + 1})`;
    sel.appendChild(opt);
  }
}

function setStatusMesa(txtForcado) {
  const el = $('#status-mesa');
  if (!el) return;
  if (txtForcado) { el.textContent = txtForcado; return; }
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    el.textContent = 'Conectando ao servidor…';
  } else {
    el.textContent = mesaConectada
      ? '✓ Conectado ao servidor e a mesa'
      : '⚠ Servidor OK, mas a mesa esta offline';
  }
}

$('#btn-entrar').addEventListener('click', () => {
  $('#login-erro').textContent = '';
  const musicoId = $('#sel-musico').value;
  const senha = $('#inp-senha').value;
  // Guarda para reconectar sozinho se a conexao cair depois.
  ultimoLogin = { musicoId, senha };
  enviar({ tipo: 'login_musico', musicoId, senha });
});
$('#inp-senha').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#btn-entrar').click();
});

// ---------------------------------------------------------------------------
//  ENTRAR NO MIXER  -  monta os faders
// ---------------------------------------------------------------------------
function entrarNoMixer() {
  $('#tela-login').classList.remove('ativa');
  $('#tela-mixer').classList.add('ativa');
  $('#nome-musico').textContent = musico.nome;
  atualizarBadgeMesa();

  const cont = $('#faders');
  cont.innerHTML = '';
  for (const canal of fatiar20(musico.canais)) {
    cont.appendChild(criarFader(canal));
  }
}

// Garante no maximo 20 canais por fone (regra da igreja).
function fatiar20(canais) {
  return canais.slice(0, 20);
}

function criarFader(canal) {
  const box = document.createElement('div');
  box.className = 'fader';

  const nome = document.createElement('div');
  nome.className = 'fader-nome';
  nome.textContent = canal.nome;

  const range = document.createElement('input');
  range.className = 'fader-range';
  range.type = 'range';
  range.min = 0; range.max = 100; range.value = 50;

  const valor = document.createElement('div');
  valor.className = 'fader-valor';
  valor.textContent = '50%';

  const btnMute = document.createElement('button');
  btnMute.className = 'btn-mute';
  btnMute.textContent = 'ON';

  // guarda referencias
  fadersPorCanal[canal.id] = { range, valor, btnMute, mutado: false };

  // fader -> envia nivel (0..1) para o servidor
  range.addEventListener('input', () => {
    const pct = Number(range.value);
    valor.textContent = pct + '%';
    range.style.setProperty('--pct', pct + '%');
    enviar({ tipo: 'set_nivel', canal: canal.id, valor: pct / 100 });
  });

  // botao mute
  btnMute.addEventListener('click', () => {
    const ref = fadersPorCanal[canal.id];
    ref.mutado = !ref.mutado;
    // "mix=1" = ligado/ouvindo; "mix=0" = mutado
    enviar({ tipo: 'set_mix', canal: canal.id, ligado: !ref.mutado });
    pintarMute(canal.id);
  });

  box.append(nome, range, valor, btnMute);
  return box;
}

// ---------------------------------------------------------------------------
//  Aplicar estados recebidos do servidor/mesa
// ---------------------------------------------------------------------------
function aplicarEstadoCanal(canal, nivel, mix) {
  aplicarNivel(canal, nivel);
  aplicarMix(canal, mix);
}

function aplicarNivel(canal, nivel01) {
  const ref = fadersPorCanal[canal];
  if (!ref) return;
  const pct = Math.round(clamp01(nivel01) * 100);
  ref.range.value = pct;
  ref.valor.textContent = pct + '%';
  ref.range.style.setProperty('--pct', pct + '%');
}

function aplicarMix(canal, mixValor) {
  const ref = fadersPorCanal[canal];
  if (!ref) return;
  ref.mutado = Number(mixValor) === 0; // 0 = mutado
  pintarMute(canal);
}

function pintarMute(canal) {
  const ref = fadersPorCanal[canal];
  if (!ref) return;
  if (ref.mutado) {
    ref.btnMute.textContent = 'MUTE';
    ref.btnMute.classList.add('mutado');
  } else {
    ref.btnMute.textContent = 'ON';
    ref.btnMute.classList.remove('mutado');
  }
}

function aplicarMaster(nivel01) {
  const pct = Math.round(clamp01(nivel01) * 100);
  $('#master-slider').value = pct;
  $('#master-valor').textContent = pct + '%';
}

// master do fone
$('#master-slider').addEventListener('input', (e) => {
  const pct = Number(e.target.value);
  $('#master-valor').textContent = pct + '%';
  enviar({ tipo: 'set_master', valor: pct / 100 });
});

// ---------------------------------------------------------------------------
//  ABAS (Mix / Chat)
// ---------------------------------------------------------------------------
document.querySelectorAll('.aba').forEach((aba) => {
  aba.addEventListener('click', () => {
    document.querySelectorAll('.aba').forEach((a) => a.classList.remove('ativa'));
    aba.classList.add('ativa');
    abaAtual = aba.dataset.aba;
    $('#painel-mix').classList.toggle('ativo', abaAtual === 'mix');
    $('#painel-chat').classList.toggle('ativo', abaAtual === 'chat');
    if (abaAtual === 'chat') zerarNaoLidas();
  });
});

// ---------------------------------------------------------------------------
//  CHAT
// ---------------------------------------------------------------------------
function enviarChat(texto) {
  const t = (texto || '').trim();
  if (!t) return;
  enviar({ tipo: 'chat', texto: t });
  $('#chat-input').value = '';
}

$('#chat-enviar').addEventListener('click', () => enviarChat($('#chat-input').value));
$('#chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') enviarChat($('#chat-input').value);
});
document.querySelectorAll('.rapida').forEach((b) => {
  b.addEventListener('click', () => enviarChat(b.dataset.msg));
});

function receberChat(msg) {
  const cont = $('#chat-mensagens');
  const div = document.createElement('div');
  const minha = msg.de === (musico && musico.nome);
  div.className = 'msg ' + (minha ? 'minha' : 'deles');
  div.innerHTML = `<span class="autor">${escapar(msg.de)}</span>${escapar(msg.texto)}`;
  cont.appendChild(div);
  cont.scrollTop = cont.scrollHeight;
  // Nao conta como "nao lida" se: e minha, se estou na aba chat, ou se e
  // historico chegando logo apos o login.
  if (abaAtual !== 'chat' && !minha && !recebendoHistorico) {
    naoLidas++;
    const badge = $('#chat-badge');
    badge.textContent = naoLidas;
    badge.classList.remove('oculto');
  }
}

function zerarNaoLidas() {
  naoLidas = 0;
  $('#chat-badge').classList.add('oculto');
}

// ---------------------------------------------------------------------------
//  helpers
// ---------------------------------------------------------------------------
function atualizarBadgeMesa() {
  const b = $('#badge-mesa');
  if (!b) return;
  if (mesaConectada) { b.textContent = 'mesa on'; b.className = 'badge badge-on'; }
  else { b.textContent = 'mesa off'; b.className = 'badge badge-off'; }
}
function clamp01(n) { n = Number(n); if (!isFinite(n)) return 0; return Math.max(0, Math.min(1, n)); }
function escapar(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------------------
//  Inicio
// ---------------------------------------------------------------------------
montarLogin();
conectar();
