// ============================================================================
//  APP DO MUSICO  (visual "console de monitor / IEM")
// ============================================================================
//  Conversa com o SEU servidor por WebSocket. Nunca fala direto com a mesa.
//  Fluxo: escolhe musico -> senha -> entra -> mexe nos faders do fone dele.
// ============================================================================

const $ = (sel) => document.querySelector(sel);

/**
 * Throttle com "trailing edge" garantido: limita fn a rodar no maximo uma vez
 * a cada intervaloMs, mas SEMPRE executa a ultima chamada recebida (atrasada,
 * se preciso) — importante para o valor final do fader sempre ser aplicado,
 * mesmo que o usuario tenha arrastado rapido e algumas chamadas do meio sejam
 * puladas.
 */
function criarThrottle(fn, intervaloMs) {
  let ultimoEnvio = 0;
  let timer = null;
  let argsPendentes = null;
  return (...args) => {
    const agora = Date.now();
    const espera = intervaloMs - (agora - ultimoEnvio);
    if (espera <= 0) {
      ultimoEnvio = agora;
      fn(...args);
    } else {
      argsPendentes = args;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          ultimoEnvio = Date.now();
          fn(...argsPendentes);
          argsPendentes = null;
        }, espera);
      }
    }
  };
}

// Estado local
let ws = null;
let musico = null;            // dados do musico logado
let mesaConectada = false;
let masterPct = 75;
let abaAtual = 'mix';
let naoLidas = 0;
let recebendoHistorico = false;
let timerHistorico = null;
let ultimoLogin = null;       // { musicoId, senha } — para reconectar sozinho

// canal.id -> { pct, on, color, el:{band,fill,cap,valor,btn,ledBtn,vuFill,vuPeak,faderTrack} }
const canais = {};

// ---------------------------------------------------------------------------
//  Cor unica (amarelo) para todos os canais — visual consistente de console.
//  A "sub" (tag abaixo do nome) e' so informativa, derivada do NOME; nao muda
//  mais a cor. Pode-se sobrescrever a tag passando { sub } no config.js.
// ---------------------------------------------------------------------------
const COR_UNICA = '#f2c94c';
const MAPA = [
  { re: /bumbo|kick/i,               sub: 'KICK' },
  { re: /caixa|snare/i,              sub: 'SNARE' },
  { re: /tom/i,                      sub: 'TOM' },
  { re: /over|oh\b/i,                sub: 'OH' },
  { re: /bateria|drum/i,             sub: 'DRUMS' },
  { re: /baixo|bass/i,               sub: 'BASS' },
  { re: /guitarra|guitar|gtr/i,      sub: 'GTR' },
  { re: /viol|ac\.?gtr|acoust/i,     sub: 'AC.GTR' },
  { re: /teclado.*l|keys.*l|piano/i, sub: 'KEYS' },
  { re: /teclado|keys|synth|key/i,   sub: 'KEYS' },
  { re: /voz|vocal.*prin|lead|voc/i, sub: 'LEAD' },
  { re: /back|bgv|coro/i,            sub: 'BGV' },
  { re: /click|metron/i,             sub: 'CLICK' },
  { re: /playback|track|trk|pb/i,    sub: 'TRK' },
  { re: /minist|fala|speech|pastor|pregac/i, sub: 'SPEECH' },
  { re: /ambiente|amb|room/i,        sub: 'AMB' },
];
function estiloCanal(canal) {
  const cor = canal.cor || COR_UNICA;
  if (canal.sub) return { cor, sub: canal.sub };
  for (const m of MAPA) if (m.re.test(canal.nome)) return { cor, sub: m.sub };
  return { cor, sub: 'AUX' };
}

// ---------------------------------------------------------------------------
//  Conexao WebSocket com o servidor
// ---------------------------------------------------------------------------
function conectar() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => {
    setStatusMesa();
    if (ultimoLogin) enviar({ tipo: 'login_musico', ...ultimoLogin });
  };
  ws.onclose = () => {
    setStatusMesa('Servidor desconectado. Tentando reconectar…');
    setTimeout(conectar, 2000);
  };
  ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } tratar(m); };
}
function enviar(obj) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }

// ---------------------------------------------------------------------------
//  Recebendo mensagens do servidor
// ---------------------------------------------------------------------------
function tratar(msg) {
  switch (msg.tipo) {
    case 'bemvindo': mesaConectada = msg.mesaConectada; setStatusMesa(); break;
    case 'mesa_status': mesaConectada = msg.conectado; atualizarBadgeMesa(); setStatusMesa(); break;
    case 'login_ok':
      musico = msg.musico;
      entrarNoMixer();
      $('#chat-mensagens').innerHTML = '';
      zerarNaoLidas();
      recebendoHistorico = true;
      clearTimeout(timerHistorico);
      timerHistorico = setTimeout(() => { recebendoHistorico = false; }, 1000);
      break;
    case 'login_falhou':
      ultimoLogin = null;
      $('#login-erro').textContent = msg.motivo || 'Falha no login';
      break;
    case 'estado_canal': aplicarNivel(msg.canal, msg.nivel); aplicarMix(msg.canal, msg.mix); break;
    case 'parametro':
      if (msg.campo === 'value') aplicarNivel(msg.canal, msg.valor);
      if (msg.campo === 'mix') aplicarMix(msg.canal, msg.valor);
      break;
    case 'master': aplicarMaster(msg.valor); break;
    case 'chat': receberChat(msg); break;
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
  if (!ws || ws.readyState !== WebSocket.OPEN) el.textContent = 'Conectando ao servidor…';
  else el.textContent = mesaConectada ? '✓ Conectado ao servidor e à mesa' : '⚠ Servidor OK, mas a mesa está offline';
}

$('#btn-entrar').addEventListener('click', () => {
  $('#login-erro').textContent = '';
  const musicoId = $('#sel-musico').value;
  const senha = $('#inp-senha').value;
  ultimoLogin = { musicoId, senha };
  enviar({ tipo: 'login_musico', musicoId, senha });
});
$('#inp-senha').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-entrar').click(); });

// ---------------------------------------------------------------------------
//  ENTRAR NO MIXER — monta os canais
// ---------------------------------------------------------------------------
function entrarNoMixer() {
  $('#tela-login').classList.remove('ativa');
  $('#tela-mixer').classList.add('ativa');
  $('#nome-musico').textContent = musico.nome;
  atualizarBadgeMesa();

  // limpa referencias antigas (caso reconecte)
  for (const k of Object.keys(canais)) delete canais[k];

  const cont = $('#faders');
  cont.innerHTML = '';
  musico.canais.forEach((canal, i) => cont.appendChild(criarCanal(canal, i)));
}

function criarCanal(canal, indice) {
  const { cor, sub } = estiloCanal(canal);
  const num = String(indice + 1).padStart(2, '0');

  const box = document.createElement('div');
  box.className = 'canal';
  box.innerHTML = `
    <div class="canal-band" style="background:linear-gradient(180deg, ${cor}, ${cor}aa)"></div>
    <div class="canal-cab">
      <span class="canal-num">${num}</span>
      <span class="canal-nome">${escapar(canal.nome)}</span>
      <span class="canal-sub">${escapar(sub)}</span>
    </div>
    <div class="canal-corpo">
      <div class="escala"><span>+6</span><span>0</span><span>-6</span><span>-12</span><span>-20</span><span>-40</span><span>∞</span></div>
      <div class="vu"><div class="vu-fill"></div><div class="vu-peak"></div></div>
      <div class="fader">
        <div class="fader-trilho"></div>
        <div class="fader-fill" style="height:50%; background:linear-gradient(180deg, ${cor}, ${cor}55)"></div>
        <div class="fader-cap" style="bottom:calc(50% - 11px)"><span></span></div>
      </div>
    </div>
    <div class="canal-valor">50%</div>
    <div class="btn-on"><span class="led-btn"></span><span class="btn-label">ON</span></div>
  `;

  const ref = {
    pct: 50, on: true, cor,
    band: box.querySelector('.canal-band'),
    fill: box.querySelector('.fader-fill'),
    cap: box.querySelector('.fader-cap'),
    valor: box.querySelector('.canal-valor'),
    btn: box.querySelector('.btn-on'),
    ledBtn: box.querySelector('.led-btn'),
    btnLabel: box.querySelector('.btn-label'),
    vuFill: box.querySelector('.vu-fill'),
    vuPeak: box.querySelector('.vu-peak'),
    faderTrack: box.querySelector('.fader'),
  };
  canais[canal.id] = ref;

  // arrastar o fader — se o canal tem "parceiro" (par estereo, ex: Pratos L/R),
  // move os dois juntos e manda o mesmo nivel para os dois na mesa.
  // O visual (desenharFader) e' sempre instantaneo; so o ENVIO pela rede e'
  // limitado (throttle) — evita acumular atraso em conexoes mais lentas (ex:
  // acesso remoto pelo Tailscale Funnel). O ultimo valor sempre chega no fim.
  const enviarNivelThrottled = criarThrottle((pct) => {
    enviar({ tipo: 'set_nivel', canal: canal.id, valor: pct / 100 });
    if (canal.parceiro != null) {
      enviar({ tipo: 'set_nivel', canal: canal.parceiro, valor: pct / 100 });
    }
  }, 50);

  iniciarDragVertical(ref.faderTrack, (pct) => {
    ref.pct = pct;
    desenharFader(canal.id);
    if (canal.parceiro != null && canais[canal.parceiro]) {
      canais[canal.parceiro].pct = pct;
      desenharFader(canal.parceiro);
    }
    enviarNivelThrottled(pct);
  });

  // botao ON/OFF (mute)
  ref.btn.addEventListener('click', () => {
    ref.on = !ref.on;
    enviar({ tipo: 'set_mix', canal: canal.id, ligado: ref.on });
    desenharBotao(canal.id);
  });

  desenharFader(canal.id);
  desenharBotao(canal.id);
  return box;
}

// desenha fader (fill + cap + texto) a partir de ref.pct
function desenharFader(id) {
  const r = canais[id]; if (!r) return;
  const pct = Math.max(0, Math.min(100, r.pct));
  r.fill.style.height = pct + '%';
  r.cap.style.bottom = `calc(${pct}% - 11px)`;
  r.valor.textContent = pct + '%';
}

function desenharBotao(id) {
  const r = canais[id]; if (!r) return;
  const c = r.cor;
  if (r.on) {
    r.btn.style.cssText = `background:linear-gradient(180deg, ${c}30, ${c}12); border:1px solid ${c}; color:${c}; box-shadow:0 0 10px ${c}55, inset 0 0 7px ${c}22;`;
    r.ledBtn.style.cssText = `background:${c}; box-shadow:0 0 6px ${c};`;
    r.btnLabel.textContent = 'ON';
  } else {
    r.btn.style.cssText = `background:#14151a; border:1px solid #2a2c33; color:#5b6270; box-shadow:none;`;
    r.ledBtn.style.cssText = `background:#3a3d44; box-shadow:none;`;
    r.btnLabel.textContent = 'OFF';
  }
}

// Registro de callbacks dos faders: elemento .fader -> cb(pct). O gesto em si
// (decidir se e' "mexer no fader" ou "rolar para o lado") e' tratado por um
// unico arbitro la embaixo (ligarGestosDosCanais), que chama esse cb quando
// concluir que o movimento e' vertical.
const faderCallbacks = new Map();
function iniciarDragVertical(track, cb) {
  faderCallbacks.set(track, cb);
}
function calcularPctNoFader(track, clientY) {
  const rect = track.getBoundingClientRect();
  const p = (rect.bottom - clientY) / rect.height * 100;
  return Math.round(Math.max(0, Math.min(100, p)));
}

// ---------------------------------------------------------------------------
//  Aplicar estados vindos do servidor/mesa
// ---------------------------------------------------------------------------
function aplicarNivel(id, nivel01) {
  const r = canais[id]; if (!r) return;
  r.pct = Math.round(clamp01(nivel01) * 100);
  desenharFader(id);
}
function aplicarMix(id, mixValor) {
  const r = canais[id]; if (!r) return;
  r.on = Number(mixValor) !== 0; // 0 = mutado
  desenharBotao(id);
}

// ---------------------------------------------------------------------------
//  MASTER (horizontal)
// ---------------------------------------------------------------------------
function aplicarMaster(nivel01) {
  masterPct = Math.round(clamp01(nivel01) * 100);
  desenharMaster();
}
function desenharMaster() {
  $('#master-fill').style.width = masterPct + '%';
  $('#master-cap').style.left = `calc(${masterPct}% - 10px)`;
  $('#master-valor').textContent = masterPct + '%';
}
(function ligarMaster() {
  const track = $('#master-track');
  let arrastando = false;
  const aplicar = (e) => {
    const rect = track.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX);
    let p = (x - rect.left) / rect.width * 100;
    masterPct = Math.round(Math.max(0, Math.min(100, p)));
    desenharMaster();
    enviar({ tipo: 'set_master', valor: masterPct / 100 });
  };
  const down = (e) => { arrastando = true; e.preventDefault(); aplicar(e);
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); };
  const move = (e) => { if (arrastando) aplicar(e); };
  const up = () => { arrastando = false;
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  track.addEventListener('pointerdown', down);
})();

// ---------------------------------------------------------------------------
//  VU METERS (medidores de audio ao lado de cada fader)
// ---------------------------------------------------------------------------
//  IMPORTANTE: por enquanto NAO existe animacao "fake". Os medidores so se
//  mexem se receberem o nivel REAL de audio da mesa. Como ainda nao captamos
//  o metering da Ui24R, eles ficam parados/vazios (comportamento honesto).
//
//  Quando ligarmos o metering real (na igreja), basta chamar:
//     setNivelAudio(canalId, nivel)   // nivel de 0.0 a 1.0
//  e o medidor daquele canal passa a refletir o audio de verdade.
// ---------------------------------------------------------------------------
let vuMedidas = {}, vuPeaks = {};

/** Recebe o nivel de audio REAL de um canal (0..1) e anima o medidor suavemente. */
function setNivelAudio(id, nivel) {
  const r = canais[id]; if (!r) return;
  const t = clamp01(nivel);
  if (vuMedidas[id] == null) { vuMedidas[id] = 0; vuPeaks[id] = 0; }
  vuMedidas[id] = t;
  if (t > vuPeaks[id]) vuPeaks[id] = t;
}

/** Loop leve so para o decaimento suave do "peak" e desenhar. Nao inventa sinal. */
function loopVU() {
  requestAnimationFrame(loopVU);
  for (const id in canais) {
    const r = canais[id];
    const v = vuMedidas[id] || 0;
    // o pico desce devagar; o nivel some quando nao ha audio
    vuPeaks[id] = Math.max(v, (vuPeaks[id] || 0) - 0.006);
    r.vuFill.style.height = (v * 100).toFixed(1) + '%';
    r.vuPeak.style.bottom = ((vuPeaks[id] || 0) * 100).toFixed(1) + '%';
    // sem audio novo, o nivel decai ate zerar
    vuMedidas[id] = Math.max(0, v - 0.05);
  }
}
requestAnimationFrame(loopVU);

// Deixa acessivel para quando ligarmos o metering real da mesa.
window.setNivelAudio = setNivelAudio;

// ---------------------------------------------------------------------------
//  ARBITRO UNICO DE GESTOS na lista de canais.
//  Um mesmo toque/arraste pode comecar em cima de um fader mas na verdade ser
//  a intencao de "passar o dedo/mouse para o lado" para ver outro canal. So
//  decidimos a direcao (vertical = mexe no fader; horizontal = rola a lista)
//  depois que o movimento passa de um limiar minimo — assim um swipe lateral
//  que comeca por cima de um fader NAO muda o volume por engano (e um clique/
//  toque parado no fader continua ajustando normalmente). Funciona igual no
//  celular (touch) e no PC (mouse).
// ---------------------------------------------------------------------------
(function ligarGestosDosCanais() {
  const LIMIAR = 10; // px de movimento antes de decidir a direcao do gesto
  const cont = $('#faders');
  let gesto = null; // { tipo:'pendente'|'vertical'|'horizontal', inicioX, inicioY, scrollInicial, faderTrack }

  cont.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.btn-on')) return; // deixa o clique do MUTE em paz
    gesto = {
      tipo: 'pendente',
      inicioX: e.clientX,
      inicioY: e.clientY,
      scrollInicial: cont.scrollLeft,
      faderTrack: e.target.closest('.fader'),
    };
  });

  window.addEventListener('pointermove', (e) => {
    if (!gesto) return;
    const dx = e.clientX - gesto.inicioX;
    const dy = e.clientY - gesto.inicioY;

    if (gesto.tipo === 'pendente') {
      if (Math.abs(dx) < LIMIAR && Math.abs(dy) < LIMIAR) return; // ainda indefinido
      // So vira "vertical" (mexe no fader) se o gesto comecou dentro de um
      // fader E o movimento predominante e' vertical. Caso contrario, rola.
      gesto.tipo = (gesto.faderTrack && Math.abs(dy) >= Math.abs(dx)) ? 'vertical' : 'horizontal';
      if (gesto.tipo === 'horizontal') cont.classList.add('arrastando');
    }

    if (gesto.tipo === 'vertical') {
      e.preventDefault();
      const cb = faderCallbacks.get(gesto.faderTrack);
      if (cb) cb(calcularPctNoFader(gesto.faderTrack, e.clientY));
    } else {
      cont.scrollLeft = gesto.scrollInicial - dx;
    }
  });

  window.addEventListener('pointerup', (e) => {
    if (gesto && gesto.tipo === 'pendente' && gesto.faderTrack) {
      // toque/clique simples no fader (sem arrastar) -> aplica no ponto tocado
      const cb = faderCallbacks.get(gesto.faderTrack);
      if (cb) cb(calcularPctNoFader(gesto.faderTrack, e.clientY));
    }
    gesto = null;
    cont.classList.remove('arrastando');
  });
})();

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
$('#chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') enviarChat($('#chat-input').value); });
document.querySelectorAll('.rapida').forEach((b) => b.addEventListener('click', () => enviarChat(b.dataset.msg)));

function receberChat(msg) {
  const cont = $('#chat-mensagens');
  const div = document.createElement('div');
  const minha = msg.de === (musico && musico.nome);
  div.className = 'msg ' + (minha ? 'minha' : 'deles');
  div.innerHTML = `<span class="autor">${escapar(msg.de)}</span>${escapar(msg.texto)}`;
  cont.appendChild(div);
  cont.scrollTop = cont.scrollHeight;
  if (abaAtual !== 'chat' && !minha && !recebendoHistorico) {
    naoLidas++;
    const badge = $('#chat-badge');
    badge.textContent = naoLidas;
    badge.classList.remove('oculto');
  }
}
function zerarNaoLidas() { naoLidas = 0; $('#chat-badge').classList.add('oculto'); }

// ---------------------------------------------------------------------------
//  helpers
// ---------------------------------------------------------------------------
function atualizarBadgeMesa() {
  const b = $('#badge-mesa');
  if (!b) return;
  const txt = b.querySelector('.txt');
  if (mesaConectada) { b.className = 'badge-mesa on'; if (txt) txt.textContent = 'MESA ON'; }
  else { b.className = 'badge-mesa off'; if (txt) txt.textContent = 'MESA OFF'; }
}
function clamp01(n) { n = Number(n); if (!isFinite(n)) return 0; return Math.max(0, Math.min(1, n)); }
function escapar(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// ---------------------------------------------------------------------------
montarLogin();
conectar();
