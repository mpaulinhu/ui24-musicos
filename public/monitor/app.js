// ============================================================================
//  APP DO MONITOR (House Mix)
// ============================================================================
//  Mostra as mensagens dos musicos em destaque, a lista de quem esta online,
//  e permite a house mix responder a todos.
// ============================================================================

const $ = (s) => document.querySelector(s);

let ws = null;
let autenticado = false;

// palavras que deixam o cartao "urgente" (vermelho)
const URGENTES = ['microfonia', 'apito', 'urgente', 'parou', 'sem som', 'caiu', 'socorro'];

// Guarda a senha do ultimo login para refazer sozinho se cair a conexao.
let ultimaSenha = null;

function conectar() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => {
    // Reconectou: se ja estavamos logados, faz login de novo automaticamente.
    if (ultimaSenha != null) enviar({ tipo: 'login_housemix', senha: ultimaSenha });
  };
  ws.onclose = () => setTimeout(conectar, 2000);
  ws.onmessage = (ev) => {
    let msg; try { msg = JSON.parse(ev.data); } catch { return; }
    tratar(msg);
  };
}
function enviar(o) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); }

function tratar(msg) {
  switch (msg.tipo) {
    case 'login_ok':
      autenticado = true;
      $('#tela-login').classList.remove('ativa');
      $('#tela-monitor').classList.add('ativa');
      break;
    case 'login_falhou':
      ultimaSenha = null; // evita loop de login com senha errada
      $('#login-erro').textContent = msg.motivo || 'Senha invalida';
      break;
    case 'chat':
      mostrarMensagem(msg);
      break;
    case 'presenca':
      mostrarPresenca(msg.online || []);
      break;
  }
}

// ---------------- LOGIN ----------------
$('#btn-entrar').addEventListener('click', () => {
  $('#login-erro').textContent = '';
  ultimaSenha = $('#inp-senha').value; // guarda para reconexao automatica
  enviar({ tipo: 'login_housemix', senha: ultimaSenha });
});
$('#inp-senha').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#btn-entrar').click();
});

// ---------------- MENSAGENS ----------------
function mostrarMensagem(msg) {
  const cont = $('#mensagens');
  const vazio = cont.querySelector('.vazio');
  if (vazio) vazio.remove();

  const ehHouse = msg.papel === 'housemix';
  const urgente = URGENTES.some((p) => (msg.texto || '').toLowerCase().includes(p));

  const div = document.createElement('div');
  div.className = 'cartao' + (ehHouse ? ' housemix' : '') + (urgente ? ' urgente' : '');
  div.innerHTML = `
    <div class="cab">
      <span class="autor">${escapar(msg.de)}</span>
      <span class="hora">${horaAgora()}</span>
    </div>
    <div class="texto">${escapar(msg.texto)}</div>
  `;
  cont.appendChild(div);
  cont.scrollTop = cont.scrollHeight;

  // Beep curto para chamar atencao (so em mensagens de musico)
  if (!ehHouse) tocarBeep(urgente);
}

function mostrarPresenca(lista) {
  const el = $('#lista-presenca');
  if (!lista.length) { el.innerHTML = '<span class="ninguem">ninguém</span>'; return; }
  el.innerHTML = '';
  for (const p of lista) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = `${p.nome} (fone ${p.aux + 1})`;
    el.appendChild(chip);
  }
}

// ---------------- RESPONDER ----------------
function responder(texto) {
  const t = (texto || '').trim();
  if (!t) return;
  enviar({ tipo: 'chat_resposta', texto: t });
  $('#resp-input').value = '';
}
$('#resp-enviar').addEventListener('click', () => responder($('#resp-input').value));
$('#resp-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') responder($('#resp-input').value);
});

// ---------------- LIMPAR ----------------
$('#btn-limpar').addEventListener('click', () => {
  $('#mensagens').innerHTML = '<div class="vazio">Tela limpa. Aguardando mensagens…</div>';
});

// ---------------- helpers ----------------
function horaAgora() {
  // Usa o relogio do proprio computador do monitor.
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Beep usando Web Audio (sem arquivo externo).
let audioCtx = null;
function tocarBeep(urgente) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = urgente ? 880 : 620;
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.26);
  } catch { /* alguns navegadores exigem interacao antes de tocar audio */ }
}

function escapar(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

conectar();
