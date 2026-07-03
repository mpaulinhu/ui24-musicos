// Espiao: mostra ao vivo os comandos que passam entre o servidor e a mesa.
const $ = (s) => document.querySelector(s);
let ws = null, senha = null, pausado = false, soConhecidos = true;

function conectar() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => { if (senha != null) enviar({ tipo: 'login_espiao', senha }); };
  ws.onclose = () => setTimeout(conectar, 2000);
  ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } tratar(m); };
}
function enviar(o) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); }

function tratar(msg) {
  switch (msg.tipo) {
    case 'login_ok':
      $('#tela-login').classList.remove('ativa');
      $('#tela-espiao').classList.add('ativa');
      setMesa(msg.mesaConectada);
      break;
    case 'login_falhou':
      $('#login-erro').textContent = msg.motivo || 'Senha invalida';
      break;
    case 'mesa_status':
      setMesa(msg.conectado);
      break;
    case 'espiao':
      if (!pausado) adicionar(msg);
      break;
  }
}

function setMesa(on) {
  const b = $('#badge-mesa');
  b.textContent = on ? 'mesa on' : 'mesa off';
  b.className = 'badge ' + (on ? 'badge-on' : 'badge-off');
}

// contador simples de tempo (sem depender de relogio exato)
let seq = 0;
function adicionar(m) {
  // Se o filtro "so conhecidos" esta ligado, ignora comandos que nao traduzimos.
  if (soConhecidos && !m.traduzido) return;

  const lista = $('#lista');
  const vazio = lista.querySelector('.vazio');
  if (vazio) vazio.remove();

  const linha = document.createElement('div');
  linha.className = 'linha';
  const hora = new Date();
  const hh = String(hora.getHours()).padStart(2, '0');
  const mm = String(hora.getMinutes()).padStart(2, '0');
  const ss = String(hora.getSeconds()).padStart(2, '0');

  const dirClasse = m.direcao === 'enviado' ? 'dir-enviado' : 'dir-recebido';
  const dirTexto = m.direcao === 'enviado' ? '→ mesa' : '← mesa';
  const trad = m.traduzido
    ? `<span class="col-trad">${escapar(m.traduzido)}</span>`
    : `<span class="col-trad desconhecido">(comando nao mapeado)</span>`;

  linha.innerHTML =
    `<span class="col-hora">${hh}:${mm}:${ss}</span>` +
    `<span class="${dirClasse}">${dirTexto}</span>` +
    trad +
    `<span class="col-cru">${escapar(m.msg)}</span>`;

  lista.insertBefore(linha, lista.firstChild); // mais novo no topo
  // limita a 500 linhas para nao pesar
  while (lista.children.length > 500) lista.removeChild(lista.lastChild);
}

// controles
$('#btn-entrar').addEventListener('click', () => {
  senha = $('#inp-senha').value;
  enviar({ tipo: 'login_espiao', senha });
});
$('#inp-senha').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-entrar').click(); });
$('#chk-so-conhecidos').addEventListener('change', (e) => { soConhecidos = e.target.checked; });
$('#btn-limpar').addEventListener('click', () => { $('#lista').innerHTML = ''; });
$('#btn-pausar').addEventListener('click', (e) => {
  pausado = !pausado;
  e.target.textContent = pausado ? 'Continuar' : 'Pausar';
  e.target.classList.toggle('ativo', pausado);
});

function escapar(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

conectar();
