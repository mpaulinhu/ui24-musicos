// ============================================================================
//  ADMIN — edita a config (mesa, senhas, musicos, canais, mute geral) e aplica
//  ao vivo pelo servidor. Protegido pela senha de admin.
// ============================================================================
const $ = (s) => document.querySelector(s);

let senhaAdmin = sessionStorage.getItem('admin_senha') || null;
let configCarregada = null; // guarda a config crua para preservar campos nao editados

// ---- toast ----
let _t = null;
function aviso(texto, tipo = '') {
  const el = $('#aviso-toast');
  el.textContent = texto;
  el.className = 'aviso-toast ' + tipo;
  clearTimeout(_t);
  _t = setTimeout(() => el.classList.add('oculto'), 4000);
}

// ---- API ----
async function api(rota, corpo) {
  const r = await fetch(rota, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  return r.json();
}

// ---- LOGIN ----
$('#btn-entrar').addEventListener('click', entrar);
$('#inp-senha').addEventListener('keydown', (e) => { if (e.key === 'Enter') entrar(); });

async function entrar() {
  const senha = $('#inp-senha').value;
  $('#login-erro').textContent = '';
  const resp = await api('/api/admin/get', { senha });
  if (!resp.ok) { $('#login-erro').textContent = resp.erro || 'Senha invalida'; return; }
  senhaAdmin = senha;
  sessionStorage.setItem('admin_senha', senha);
  abrirPainel(resp.config);
}

function abrirPainel(cfg) {
  configCarregada = cfg;
  $('#tela-login').classList.remove('ativa');
  $('#tela-admin').classList.add('ativa');
  preencher(cfg);
}

// ---- PREENCHER FORMULARIO ----
function preencher(cfg) {
  $('#mesa-host').value = cfg.mesa?.host ?? '';
  $('#mesa-port').value = cfg.mesa?.port ?? '';
  $('#srv-port').textContent = cfg.servidor?.port ?? 3000;
  $('#senha-house').value = cfg.houseMix?.senha ?? '';
  $('#senha-admin').value = cfg.admin?.senha ?? '';

  $('#lista-musicos').innerHTML = '';
  (cfg.musicos || []).forEach((m) => $('#lista-musicos').appendChild(linhaMusico(m)));

  $('#lista-canais').innerHTML = '';
  (cfg.canais || []).forEach((c) => $('#lista-canais').appendChild(linhaCanal(c)));

  $('#lista-mute').innerHTML = '';
  (cfg.muteGeral || []).forEach((c) => $('#lista-mute').appendChild(linhaMute(c)));
}

// ---- LINHAS DINAMICAS ----
function inp(valor, ph, tipo = 'text') {
  const i = document.createElement('input');
  i.type = tipo; i.value = valor ?? ''; i.placeholder = ph || '';
  return i;
}
function botaoRemover(linha) {
  const b = document.createElement('button');
  b.className = 'btn-rem'; b.textContent = '✕'; b.title = 'Remover';
  b.addEventListener('click', () => linha.remove());
  return b;
}

function linhaMusico(m = {}) {
  const linha = document.createElement('div');
  linha.className = 'linha linha-musico';
  linha.dataset.id = m.id || ''; // preserva id existente
  const nome = inp(m.nome, 'Baterista');
  const senha = inp(m.senha, '1234');
  const aux = inp(m.aux, '0', 'number');
  const par = inp(m.auxParceiro, '—', 'number');
  linha._campos = { nome, senha, aux, par };
  linha.append(nome, senha, aux, par, botaoRemover(linha));
  return linha;
}

function linhaCanal(c = {}) {
  const linha = document.createElement('div');
  linha.className = 'linha linha-canal';
  // preserva campos avancados (Line In etc.) que nao editamos na tela
  if (c.tipo != null) linha.dataset.tipo = c.tipo;
  if (c.canalMesa != null) linha.dataset.canalMesa = c.canalMesa;
  const id = inp(c.id, '0', 'number');
  const nome = inp(c.nome, 'Guitarra');
  const par = inp(c.parceiro, '—', 'number');
  linha._campos = { id, nome, par };
  linha.append(id, nome, par, botaoRemover(linha));
  return linha;
}

function linhaMute(c = {}) {
  const linha = document.createElement('div');
  linha.className = 'linha linha-mute';
  const nome = inp(c.nome, 'Guitarra');
  const id = inp(c.id, '0', 'number');
  const par = inp(c.parceiro, '—', 'number');
  linha._campos = { nome, id, par };
  linha.append(nome, id, par, botaoRemover(linha));
  return linha;
}

// botoes "+ adicionar"
document.querySelectorAll('[data-add]').forEach((b) => {
  b.addEventListener('click', () => {
    if (b.dataset.add === 'musico') $('#lista-musicos').appendChild(linhaMusico());
    if (b.dataset.add === 'canal') $('#lista-canais').appendChild(linhaCanal());
    if (b.dataset.add === 'mute') $('#lista-mute').appendChild(linhaMute());
  });
});

// ---- COLETAR + SALVAR ----
function numeroOuNada(v) {
  const s = String(v).trim();
  if (s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}
function slug(nome, usados) {
  let base = String(nome).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '') || 'musico';
  let id = base, i = 2;
  while (usados.has(id)) id = base + i++;
  usados.add(id);
  return id;
}

function coletar() {
  const usados = new Set();
  const musicos = [...$('#lista-musicos').children].map((linha) => {
    const { nome, senha, aux, par } = linha._campos;
    let id = (linha.dataset.id || '').trim();
    if (id) usados.add(id);
    return { linha, nome: nome.value.trim(), senha: senha.value, aux, par, idExistente: id };
  }).map((m) => ({
    id: m.idExistente || slug(m.nome, usados),
    nome: m.nome,
    senha: m.senha,
    aux: numeroOuNada(m.aux.value) ?? 0,
    ...(numeroOuNada(m.par.value) != null ? { auxParceiro: numeroOuNada(m.par.value) } : {}),
    canais: 'todos',
  }));

  const canais = [...$('#lista-canais').children].map((linha) => {
    const { id, nome, par } = linha._campos;
    const o = { id: numeroOuNada(id.value) ?? 0, nome: nome.value.trim() };
    if (numeroOuNada(par.value) != null) o.parceiro = numeroOuNada(par.value);
    if (linha.dataset.tipo != null) o.tipo = linha.dataset.tipo;
    if (linha.dataset.canalMesa != null) o.canalMesa = Number(linha.dataset.canalMesa);
    return o;
  });

  const muteGeral = [...$('#lista-mute').children].map((linha) => {
    const { nome, id, par } = linha._campos;
    const o = { id: numeroOuNada(id.value) ?? 0, nome: nome.value.trim() };
    if (numeroOuNada(par.value) != null) o.parceiro = numeroOuNada(par.value);
    return o;
  });

  return {
    ...configCarregada, // preserva servidor, totalCanais, totalAuxes
    mesa: { host: $('#mesa-host').value.trim(), port: numeroOuNada($('#mesa-port').value) ?? 80 },
    canais,
    musicos,
    muteGeral,
    houseMix: { senha: $('#senha-house').value },
    admin: { senha: $('#senha-admin').value },
  };
}

async function salvar() {
  const nova = coletar();
  const resp = await api('/api/admin/save', { senha: senhaAdmin, config: nova });
  if (!resp.ok) { aviso(resp.erro || 'Erro ao salvar', 'erro'); return; }
  configCarregada = nova;
  // se a nova senha de admin mudou, atualiza a guardada
  senhaAdmin = nova.admin.senha;
  sessionStorage.setItem('admin_senha', senhaAdmin);
  aviso(resp.mesaMudou ? 'Salvo! Reconectando na mesa nova…' : 'Salvo e aplicado!', 'ok');
}
$('#btn-salvar').addEventListener('click', salvar);
$('#btn-salvar-2').addEventListener('click', salvar);

// ---- entra sozinho se a senha ja estiver na sessao ----
(async function inicio() {
  if (!senhaAdmin) return;
  const resp = await api('/api/admin/get', { senha: senhaAdmin });
  if (resp.ok) abrirPainel(resp.config);
  else sessionStorage.removeItem('admin_senha');
})();
