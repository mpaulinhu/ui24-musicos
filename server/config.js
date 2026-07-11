// ============================================================================
//  CONFIGURACAO GERAL  -  agora vem de config.json (dados), nao de codigo.
// ============================================================================
//
//  A configuracao (mesa, musicos, canais, senhas) fica em config.json e pode
//  ser editada pela TELA ADMIN (/admin) sem mexer em codigo nem reiniciar o
//  servidor. Este modulo:
//    1) Carrega config.json na inicializacao.
//    2) "Resolve" a config crua (ex: expande musico.canais = "todos" para a
//       lista completa de canais) no objeto `config` que o resto do app usa.
//    3) Salva/aplica alteracoes ao vivo (salvarConfig), mutando o MESMO objeto
//       `config` em memoria — por isso quem fez `import { config }` ve a mudanca.
//
//  Formato de config.json: ver o proprio arquivo. Campos principais:
//    mesa {host, port}, servidor {port}, canais[], musicos[], muteGeral[],
//    houseMix {senha}, admin {senha}.
//    - musico.canais: "todos" (usa todos os canais) OU uma lista de ids.
// ============================================================================

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARQ = path.join(__dirname, 'config.json');
const ARQ_MODELO = path.join(__dirname, 'config.default.json');

// config.json NAO vai para o Git (cada instalacao tem a sua, com senhas/IP
// proprios). Na primeira execucao (clone novo), criamos a partir do modelo.
if (!existsSync(ARQ)) copyFileSync(ARQ_MODELO, ARQ);

// Config CRUA (como esta no JSON) — usada pela tela admin para editar.
let configRaw = lerArquivo();

// Config RESOLVIDA (o que o resto do app consome). Mesmo objeto para sempre:
// nunca reatribuimos, so' mutamos o conteudo (para os imports verem a mudanca).
export const config = {};
aplicarNoObjeto(resolver(configRaw));

// ---------------------------------------------------------------------------

function lerArquivo() {
  return JSON.parse(readFileSync(ARQ, 'utf8'));
}

// Transforma a config crua na resolvida: principalmente expande o campo
// "canais" de cada musico ("todos" -> lista completa; ou lista de ids -> filtra).
function resolver(raw) {
  const canais = (raw.canais || []).map((c) => ({ ...c }));
  const porId = new Map(canais.map((c) => [c.id, c]));

  const musicos = (raw.musicos || []).map((m) => {
    let lista;
    if (m.canais === 'todos' || m.canais == null) {
      lista = canais;
    } else if (Array.isArray(m.canais)) {
      lista = m.canais.map((id) => porId.get(id)).filter(Boolean);
    } else {
      lista = canais;
    }
    return { ...m, canais: lista };
  });

  return {
    mesa: { ...raw.mesa },
    servidor: { ...raw.servidor },
    totalCanais: raw.totalCanais,
    totalAuxes: raw.totalAuxes,
    canais,
    musicos,
    muteGeral: (raw.muteGeral || []).map((c) => ({ ...c })),
    houseMix: { ...raw.houseMix },
    admin: { ...raw.admin },
  };
}

// Muta o objeto `config` EM MEMORIA (sem reatribuir) para preservar os imports.
function aplicarNoObjeto(resolvido) {
  for (const k of Object.keys(config)) delete config[k];
  Object.assign(config, resolvido);
}

// Validacao minima da config crua (evita salvar algo que quebre o servidor).
function validar(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Configuracao invalida.');
  if (!raw.mesa || typeof raw.mesa.host !== 'string' || !raw.mesa.host.trim())
    throw new Error('IP da mesa (mesa.host) e obrigatorio.');
  if (!Number.isFinite(Number(raw.mesa.port))) throw new Error('Porta da mesa invalida.');
  if (!Array.isArray(raw.canais)) throw new Error('Lista de canais invalida.');
  if (!Array.isArray(raw.musicos)) throw new Error('Lista de musicos invalida.');
  const ids = new Set();
  for (const m of raw.musicos) {
    if (!m.id || !String(m.id).trim()) throw new Error('Todo musico precisa de um id.');
    if (ids.has(m.id)) throw new Error(`Musico com id repetido: ${m.id}`);
    ids.add(m.id);
    if (!Number.isFinite(Number(m.aux))) throw new Error(`Aux invalido no musico ${m.id}.`);
  }
  if (!raw.houseMix || !String(raw.houseMix.senha ?? '')) throw new Error('Senha da House Mix obrigatoria.');
  if (!raw.admin || !String(raw.admin.senha ?? '')) throw new Error('Senha de admin obrigatoria.');
}

// ---- API publica -----------------------------------------------------------

/** Config crua (para a tela admin editar). Copia, para nao vazar referencia. */
export function lerConfigRaw() {
  return JSON.parse(JSON.stringify(configRaw));
}

/**
 * Valida, grava em disco e aplica ao vivo uma nova config crua.
 * Muta o objeto `config` em memoria. NAO cuida de efeitos colaterais
 * (reconectar na mesa, remontar mapas do index.js) — quem chama faz isso.
 * @returns {{mesaMudou:boolean}}
 */
export function salvarConfig(novoRaw) {
  validar(novoRaw);
  const mesaMudou =
    novoRaw.mesa.host !== configRaw.mesa.host ||
    Number(novoRaw.mesa.port) !== Number(configRaw.mesa.port);
  // normaliza numeros
  novoRaw.mesa.port = Number(novoRaw.mesa.port);
  writeFileSync(ARQ, JSON.stringify(novoRaw, null, 2), 'utf8');
  configRaw = novoRaw;
  aplicarNoObjeto(resolver(novoRaw));
  return { mesaMudou };
}

/** Encontra um musico pelo id. */
export function acharMusico(id) {
  return config.musicos.find((m) => m.id === id) || null;
}
