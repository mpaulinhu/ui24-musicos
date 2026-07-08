// ============================================================================
//  SERVIDOR CENTRAL
// ============================================================================
//
//  Este e o programa que roda no PC/Raspberry da igreja. Ele:
//
//    1) Mantem UMA conexao com a mesa Ui24R (nao estoura o limite dela).
//    2) Serve as paginas web (interface do musico e monitor da house mix).
//    3) Aceita conexoes WebSocket dos musicos e da house mix.
//    4) Faz login simples por musico (cada um so mexe no fone DELE).
//    5) Repassa comandos musico -> mesa e atualizacoes mesa -> musicos.
//    6) Cuida do CHAT: musico manda mensagem -> aparece no monitor da house mix.
//
//  Rode com:  npm start
// ============================================================================

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer } from 'ws';

import { config, acharMusico } from './config.js';
import { Ui24Client } from './ui24-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// ---------------------------------------------------------------------------
//  1) Conexao com a mesa
// ---------------------------------------------------------------------------
const mesa = new Ui24Client({
  host: config.mesa.host,
  port: config.mesa.port,
  raw: true, // o simulador e muitas mesas aceitam mensagens "cruas"
});

// Mapeamento reverso "tipo:indiceNaMesa" -> id interno do canal (o "id" usado
// no config.js e no protocolo com o app do musico). Necessario porque canais
// especiais (ex: Line In, tipo "l") tem um indice na mesa diferente do "id"
// que usamos internamente. Construido a partir de TODOS os musicos, entao
// funciona mesmo que cada um customize sua propria lista de canais.
const canalPorIndiceMesa = new Map();
for (const m of config.musicos) {
  for (const c of m.canais) {
    const tipo = c.tipo || 'i';
    const canalMesa = c.canalMesa != null ? c.canalMesa : c.id;
    canalPorIndiceMesa.set(`${tipo}:${canalMesa}`, c.id);
  }
}
// Devolve { canalMesa, tipo } para escrever/ler na mesa, a partir do "id" do config.
function resolverCanal(canalCfg) {
  return {
    canalMesa: canalCfg.canalMesa != null ? canalCfg.canalMesa : canalCfg.id,
    tipo: canalCfg.tipo || 'i',
  };
}

// Canais do MUTE GERAL (aba "GERAL"), indexados por id, para consulta rapida.
const muteGeralPorId = new Map(config.muteGeral.map((c) => [c.id, c]));

let mesaConectada = false;

mesa.on('status', (s) => {
  mesaConectada = s.conectado;
  console.log(
    s.conectado
      ? `[MESA] Conectado em ${s.host}:${s.port}`
      : `[MESA] Desconectado de ${s.host}:${s.port}`
  );
  // Avisa todos os clientes sobre o status da mesa
  transmitir({ tipo: 'mesa_status', conectado: s.conectado });
});

mesa.on('log', (m) => console.log('[MESA]', m));
mesa.on('erro', (m) => console.log('[MESA][erro]', m));

// MODO ESPIAO: repassa cada comando cru (enviado/recebido) para quem estiver
// olhando a pagina /espiao. Serve para descobrir os numeros reais da sua mesa.
mesa.on('bruto', ({ direcao, msg }) => {
  const traduzido = traduzirComando(msg);
  for (const cli of clientes) {
    if (cli.tipo === 'espiao') {
      enviar(cli.ws, { tipo: 'espiao', direcao, msg, traduzido });
    }
  }
});

// Traduz um comando cru da mesa em algo legivel, quando reconhecemos o padrao.
function traduzirComando(msg) {
  let corpo = msg;
  for (const pref of ['SETD^', 'SETS^', 'SET^']) {
    if (corpo.startsWith(pref)) { corpo = corpo.slice(pref.length); break; }
  }
  const idx = corpo.indexOf('^');
  if (idx === -1) return null;
  const caminho = corpo.slice(0, idx);
  const valor = corpo.slice(idx + 1);

  // Canal dentro de um aux (fone): i.<canal>.aux.<aux>.value|mute (entrada
  // normal) ou l.<canal>.aux.<aux>.value|mute (Line In, canais dedicados).
  let m = /^(i|l)\.(\d+)\.aux\.(\d+)\.(value|mute)$/.exec(caminho);
  if (m) {
    const tipo = m[1], canal = Number(m[2]), aux = Number(m[3]), campo = m[4];
    const pct = campo === 'value' ? ` = ${Math.round(Number(valor) * 100)}%` : (Number(valor) === 0 ? ' = ligado' : ' = MUTADO');
    const rotuloCanal = tipo === 'l' ? `Line In ${canal === 0 ? 'L' : 'R'}` : `Canal ${canal} (mesa: canal ${canal + 1})`;
    return `${rotuloCanal}  no  Aux ${aux} (mesa: fone ${aux + 1})  [${campo}]${pct}`;
  }
  // Master do aux (volume geral do fone): a.<aux>.mix
  m = /^a\.(\d+)\.mix$/.exec(caminho);
  if (m) {
    const aux = Number(m[1]);
    return `Volume geral do Aux ${aux} (mesa: fone ${aux + 1}) = ${Math.round(Number(valor) * 100)}%`;
  }
  return null;
}

// Quando a mesa avisa que um parametro mudou (inclusive por causa de outro
// musico ou do operador na mesa fisica), repassamos para os clientes
// que se importam com aquele canal/aux.
mesa.on('parametro', ({ caminho, valor }) => {
  const info = parseCaminho(caminho);
  if (info) {
    // Traduz o indice-na-mesa (+ tipo) de volta para o "id" interno do canal
    // (o mesmo que o app conhece). Canais que nenhum musico usa nao tem
    // entrada nesse mapa — ignoramos (nao ha para quem repassar).
    const canalId = canalPorIndiceMesa.get(`${info.tipo}:${info.canalMesa}`);
    if (canalId == null) return;
    // O protocolo da mesa usa "mute" (1=mutado); o app fala em "mix"
    // (1=ligado/ouvindo) — invertemos aqui para o app nao precisar saber
    // do detalhe do protocolo.
    const valorParaApp = info.campo === 'mute' ? (Number(valor) === 0 ? 1 : 0) : valor;
    const campoParaApp = info.campo === 'mute' ? 'mix' : info.campo;
    // Envia so para clientes cujo musico usa esse aux.
    for (const cli of clientes) {
      if (cli.tipo === 'musico' && cli.musico && cli.musico.aux === info.aux) {
        enviar(cli.ws, {
          tipo: 'parametro',
          canal: canalId,
          aux: info.aux,
          campo: campoParaApp, // 'value' ou 'mix'
          valor: valorParaApp,
        });
      }
    }
    return;
  }
  // Master do fone (volume geral): a.<aux>.mix
  const m = /^a\.(\d+)\.mix$/.exec(caminho);
  if (m) {
    const aux = Number(m[1]);
    for (const cli of clientes) {
      if (cli.tipo === 'musico' && cli.musico && cli.musico.aux === aux) {
        enviar(cli.ws, { tipo: 'master', aux, valor });
      }
    }
    return;
  }
  // Mute GERAL de um canal (fora do fone, afeta tudo): i.<canal>.mute
  // Repassa mesmo quando quem mudou foi o operador na mesa fisica, para
  // TODOS os musicos ficarem sincronizados na aba "GERAL".
  const mg = /^i\.(\d+)\.mute$/.exec(caminho);
  if (mg) {
    const canal = Number(mg[1]);
    if (muteGeralPorId.has(canal)) {
      transmitirParaTodosMusicos({ tipo: 'mute_geral', canal, mutado: Number(valor) === 1 });
    }
  }
});

// VU (medidor de audio ao vivo): a mesa manda o nivel de TODOS os canais
// continuamente (~5x/seg). Para cada musico conectado, repassamos so os
// niveis dos canais que ELE ve no fone dele.
mesa.on('vu', (dados) => {
  for (const cli of clientes) {
    if (cli.tipo !== 'musico' || !cli.autenticado) continue;
    const niveis = {};
    for (const c of cli.musico.canais) {
      const { canalMesa, tipo } = resolverCanal(c);
      const arr = tipo === 'l' ? dados.line : dados.input;
      if (arr && arr[canalMesa] != null) niveis[c.id] = arr[canalMesa];
    }
    enviar(cli.ws, { tipo: 'vu', niveis });
  }
});

mesa.conectar();

// Extrai tipo/canal(na mesa)/aux/campo de um caminho tipo "i.5.aux.0.value"
// ou "l.0.aux.8.mute" (Line In). Aceita os prefixos "i" (entrada normal) e
// "l" (Line In estereo).
function parseCaminho(caminho) {
  const m = /^(i|l)\.(\d+)\.aux\.(\d+)\.(value|mute)$/.exec(caminho);
  if (!m) return null;
  return { tipo: m[1], canalMesa: Number(m[2]), aux: Number(m[3]), campo: m[4] };
}

// ---------------------------------------------------------------------------
//  2) Servidor HTTP (serve as paginas)
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const httpServer = http.createServer(async (req, res) => {
  try {
    let url = decodeURIComponent((req.url || '/').split('?')[0]);

    // Rotas amigaveis
    if (url === '/' || url === '') url = '/musico/index.html';
    if (url === '/musico' || url === '/musico/') url = '/musico/index.html';
    if (url === '/monitor' || url === '/monitor/') url = '/monitor/index.html';
    if (url === '/espiao' || url === '/espiao/') url = '/espiao/index.html';

    // Endpoint que entrega a config publica (sem senhas) para o front montar a tela
    if (url === '/api/config') {
      res.writeHead(200, { 'Content-Type': MIME['.json'] });
      res.end(JSON.stringify(configPublica()));
      return;
    }

    // Seguranca: impede sair da pasta public
    const alvo = path.normalize(path.join(PUBLIC_DIR, url));
    if (!alvo.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end('Acesso negado');
      return;
    }

    const conteudo = await readFile(alvo);
    const ext = path.extname(alvo).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      // Desabilita cache: garante que o navegador sempre pegue a versao atual
      // (evita a "pagina feia" ficar presa em cache durante o desenvolvimento).
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    res.end(conteudo);
  } catch (err) {
    res.writeHead(404);
    res.end('Nao encontrado');
  }
});

// Config sem dados sensiveis, para o navegador montar as telas.
function configPublica() {
  return {
    totalCanais: config.totalCanais,
    totalAuxes: config.totalAuxes,
    musicos: config.musicos.map((m) => ({
      id: m.id,
      nome: m.nome,
      aux: m.aux,
      auxParceiro: m.auxParceiro,
      canais: m.canais,
    })),
    muteGeral: config.muteGeral,
  };
}

// ---------------------------------------------------------------------------
//  3) WebSocket (musicos e house mix conectam aqui)
// ---------------------------------------------------------------------------
// maxPayload maior que o padrao: o chat aceita foto/audio (base64), que pesam
// mais que uma mensagem de texto normal.
const wss = new WebSocketServer({ server: httpServer, maxPayload: 8 * 1024 * 1024 });

// Lista de clientes conectados
const clientes = new Set();

// Historico curto do chat (para quem entra depois ver as ultimas). So em
// memoria (nunca grava em disco/banco) — some sozinho quando o servidor
// reinicia, de proposito (fotos/audios sao so para o culto do dia).
const historicoChat = [];
const MAX_HISTORICO = 200; // chat geral do culto: guarda bastante mensagem
const LIMITE_MIDIA = 3 * 1024 * 1024; // ~3MB de base64 por foto/audio (ja compactado no celular)

wss.on('connection', (ws) => {
  const cli = { ws, tipo: null, musico: null, nome: null, autenticado: false };
  clientes.add(cli);

  enviar(ws, { tipo: 'bemvindo', mesaConectada });

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    tratarMensagem(cli, msg);
  });

  ws.on('close', () => {
    clientes.delete(cli);
    // Avisa a house mix que alguem saiu (para lista de presenca)
    transmitirPresenca();
  });
});

function tratarMensagem(cli, msg) {
  switch (msg.tipo) {
    // ----- LOGIN DO MUSICO -----
    case 'login_musico': {
      const m = acharMusico(msg.musicoId);
      if (!m || String(m.senha) !== String(msg.senha)) {
        enviar(cli.ws, { tipo: 'login_falhou', motivo: 'Musico ou senha invalidos' });
        return;
      }
      cli.tipo = 'musico';
      cli.musico = m;
      cli.nome = m.nome;
      cli.autenticado = true;
      enviar(cli.ws, { tipo: 'login_ok', musico: { id: m.id, nome: m.nome, aux: m.aux, canais: m.canais } });
      // Manda o estado atual de cada canal do fone dele.
      enviarEstadoInicial(cli);
      // Manda o estado atual dos 5 botoes de mute geral (aba "GERAL").
      enviarEstadoMuteGeral(cli);
      // Chat geral: manda o historico do culto atual para o musico que entrou,
      // assim ele ja ve tudo que foi conversado.
      for (const item of historicoChat) enviar(cli.ws, { tipo: 'chat', ...item });
      transmitirPresenca();
      break;
    }

    // ----- LOGIN DA HOUSE MIX (monitor) -----
    case 'login_housemix': {
      if (String(msg.senha) !== String(config.houseMix.senha)) {
        enviar(cli.ws, { tipo: 'login_falhou', motivo: 'Senha da house mix invalida' });
        return;
      }
      cli.tipo = 'housemix';
      cli.nome = 'House Mix';
      cli.autenticado = true;
      enviar(cli.ws, { tipo: 'login_ok', papel: 'housemix' });
      // Manda historico do chat e presenca
      for (const item of historicoChat) enviar(cli.ws, { tipo: 'chat', ...item });
      transmitirPresenca();
      break;
    }

    // ----- LOGIN DO ESPIAO (ferramenta de mapeamento) -----
    case 'login_espiao': {
      if (String(msg.senha) !== String(config.houseMix.senha)) {
        enviar(cli.ws, { tipo: 'login_falhou', motivo: 'Senha invalida (use a da house mix)' });
        return;
      }
      cli.tipo = 'espiao';
      cli.nome = 'Espiao';
      cli.autenticado = true;
      enviar(cli.ws, { tipo: 'login_ok', papel: 'espiao', mesaConectada });
      break;
    }

    // ----- MUSICO ALTERA NIVEL DE UM CANAL NO FONE DELE -----
    case 'set_nivel': {
      if (!podeMexer(cli, msg.canal)) return;
      const canalCfg = cli.musico.canais.find((c) => c.id === msg.canal);
      const { canalMesa, tipo } = resolverCanal(canalCfg);
      const r = mesa.setNivelCanalAux(canalMesa, cli.musico.aux, msg.valor, tipo);
      // Repassa para TODOS os dispositivos logados nesse MESMO fone (aux), nao
      // so para quem mexeu — assim varios celulares no mesmo musico ficam
      // sincronizados ao vivo (antes so o proprio dispositivo via na hora; os
      // outros so pegavam a mudanca no proximo refresh periodico da mesa).
      transmitirParaAux(cli.musico.aux, { tipo: 'parametro', canal: msg.canal, aux: cli.musico.aux, campo: 'value', valor: r.valor });
      break;
    }

    // ----- MUSICO MUTA/DESMUTA UM CANAL NO FONE DELE -----
    case 'set_mix': {
      if (!podeMexer(cli, msg.canal)) return;
      const canalCfg = cli.musico.canais.find((c) => c.id === msg.canal);
      const { canalMesa, tipo } = resolverCanal(canalCfg);
      const r = mesa.setMixCanalAux(canalMesa, cli.musico.aux, !!msg.ligado, tipo);
      transmitirParaAux(cli.musico.aux, { tipo: 'parametro', canal: msg.canal, aux: cli.musico.aux, campo: 'mix', valor: r.valor });
      break;
    }

    // ----- MUSICO AJUSTA VOLUME GERAL DO FONE DELE -----
    case 'set_master': {
      if (cli.tipo !== 'musico' || !cli.autenticado) return;
      const r = mesa.setMasterAux(cli.musico.aux, msg.valor);
      transmitirParaAux(cli.musico.aux, { tipo: 'master', aux: cli.musico.aux, valor: r.valor });
      break;
    }

    // ----- MUTE GERAL (aba "GERAL") — tira o canal de TUDO, nao so do fone.
    //       Qualquer musico logado pode usar, independente do instrumento dele. -----
    case 'set_mute_geral': {
      if (cli.tipo !== 'musico' || !cli.autenticado) return;
      const canalCfg = muteGeralPorId.get(msg.canal);
      if (!canalCfg) return;
      mesa.setMuteGeral(canalCfg.id, !!msg.mutado);
      transmitirParaTodosMusicos({ tipo: 'mute_geral', canal: canalCfg.id, mutado: !!msg.mutado });
      // Par estereo (ex: Teclado 1 = CH10+11): muta os dois juntos.
      if (canalCfg.parceiro != null) {
        mesa.setMuteGeral(canalCfg.parceiro, !!msg.mutado);
        transmitirParaTodosMusicos({ tipo: 'mute_geral', canal: canalCfg.parceiro, mutado: !!msg.mutado });
      }
      break;
    }

    // ----- CHAT: musico manda mensagem para a house mix -----
    case 'chat': {
      if (!cli.autenticado) return;
      const midia = extrairMidia(msg);
      const texto = String(msg.texto || '').slice(0, 300);
      if (!texto && !midia.imagem && !midia.audio) return; // nada para mandar
      const item = {
        de: cli.nome || 'Anonimo',
        papel: cli.tipo,
        texto,
        ...midia,
        // horario e preenchido no monitor (evitamos depender do relogio aqui)
        id: proximoIdChat(),
      };
      historicoChat.push(item);
      if (historicoChat.length > MAX_HISTORICO) historicoChat.shift();
      // Chat geral: envia para TODOS os autenticados (musicos + house mix),
      // para que todos vejam a mesma conversa.
      for (const c of clientes) {
        if (c.autenticado) enviar(c.ws, { tipo: 'chat', ...item });
      }
      break;
    }

    // ----- HOUSE MIX chama a atencao de UM musico especifico (vibra/apita o celular dele) -----
    case 'chamar_atencao': {
      if (cli.tipo !== 'housemix' || !cli.autenticado) return;
      transmitirParaMusico(msg.musicoId, { tipo: 'chamar_atencao' });
      break;
    }

    // ----- HOUSE MIX responde no chat (opcional) -----
    case 'chat_resposta': {
      if (cli.tipo !== 'housemix') return;
      const midia = extrairMidia(msg);
      const texto = String(msg.texto || '').slice(0, 300);
      if (!texto && !midia.imagem && !midia.audio) return;
      const item = {
        de: 'House Mix',
        papel: 'housemix',
        texto,
        ...midia,
        id: proximoIdChat(),
      };
      historicoChat.push(item);
      if (historicoChat.length > MAX_HISTORICO) historicoChat.shift();
      transmitir({ tipo: 'chat', ...item });
      break;
    }

    default:
      break;
  }
}

// So deixa o musico mexer em canais que estao na lista DELE.
function podeMexer(cli, canal) {
  if (cli.tipo !== 'musico' || !cli.autenticado) return false;
  return cli.musico.canais.some((c) => c.id === canal);
}

// Envia para TODOS os dispositivos logados no MESMO fone (aux) — usado para
// que varios celulares no mesmo musico fiquem sincronizados ao vivo entre si.
function transmitirParaAux(aux, obj) {
  for (const c of clientes) {
    if (c.tipo === 'musico' && c.musico && c.musico.aux === aux) enviar(c.ws, obj);
  }
}

// Envia para TODOS os musicos logados, independente do fone/aux — usado pelo
// MUTE GERAL (aba "GERAL"), que e' compartilhado entre todos os instrumentos.
function transmitirParaTodosMusicos(obj) {
  for (const c of clientes) {
    if (c.tipo === 'musico' && c.autenticado) enviar(c.ws, obj);
  }
}

// Envia para TODOS os dispositivos logados como ESSE musico especifico (por id
// do config, ex: "baterista") — usado pelo botao de "chamar atencao".
function transmitirParaMusico(musicoId, obj) {
  for (const c of clientes) {
    if (c.tipo === 'musico' && c.musico && c.musico.id === musicoId) enviar(c.ws, obj);
  }
}

// Envia o estado atual (do cache da mesa) de cada canal do fone do musico.
function enviarEstadoInicial(cli) {
  const aux = cli.musico.aux;
  for (const c of cli.musico.canais) {
    const { canalMesa, tipo } = resolverCanal(c);
    const nivel = mesa.getEstado(mesa.caminhoNivel(canalMesa, aux, tipo));
    // mesa.caminhoMix() aponta para o campo real "mute" (1=mutado); o app
    // fala em "mix" (1=ligado) — invertemos aqui, igual no repasse ao vivo.
    const mute = mesa.getEstado(mesa.caminhoMix(canalMesa, aux, tipo));
    const mix = mute == null ? 1 : (Number(mute) === 0 ? 1 : 0);
    enviar(cli.ws, {
      tipo: 'estado_canal',
      canal: c.id,
      aux,
      nivel: nivel == null ? 0.5 : nivel,
      mix,
    });
  }
  const master = mesa.getEstado(mesa.caminhoMasterAux(aux));
  enviar(cli.ws, { tipo: 'master', aux, valor: master == null ? 0.75 : master });
}

// Envia o estado atual (do cache da mesa) dos 5 canais do MUTE GERAL —
// mandado para TODO musico que loga, ja que a aba "GERAL" e' compartilhada.
function enviarEstadoMuteGeral(cli) {
  const estados = {};
  for (const c of config.muteGeral) {
    const mute = mesa.getEstado(mesa.caminhoMuteGeral(c.id));
    estados[c.id] = mute == null ? false : Number(mute) === 1;
  }
  enviar(cli.ws, { tipo: 'estado_mute_geral', estados });
}

// ---- utilidades de envio ---------------------------------------------------
let _idChat = 1;
function proximoIdChat() {
  return _idChat++;
}

// Valida foto/audio do chat (vem como data URI base64). So aceita o que
// realmente parece imagem/audio, dentro do limite de tamanho — o resto e
// descartado silenciosamente (evita guardar lixo/abuso na memoria).
function extrairMidia(msg) {
  let imagem = typeof msg.imagem === 'string' ? msg.imagem : null;
  let audio = typeof msg.audio === 'string' ? msg.audio : null;
  if (imagem && (!imagem.startsWith('data:image/') || imagem.length > LIMITE_MIDIA)) imagem = null;
  if (audio && (!audio.startsWith('data:audio/') || audio.length > LIMITE_MIDIA)) audio = null;
  return { imagem, audio };
}

function enviar(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function transmitir(obj) {
  for (const c of clientes) enviar(c.ws, obj);
}

// Informa a house mix quem esta online (lista de presenca).
function transmitirPresenca() {
  const online = [];
  for (const c of clientes) {
    if (c.tipo === 'musico' && c.autenticado) {
      online.push({ id: c.musico.id, nome: c.nome, aux: c.musico.aux });
    }
  }
  for (const c of clientes) {
    if (c.tipo === 'housemix') enviar(c.ws, { tipo: 'presenca', online });
  }
}

// ---------------------------------------------------------------------------
//  4) Sobe o servidor
// ---------------------------------------------------------------------------
httpServer.listen(config.servidor.port, () => {
  console.log('============================================================');
  console.log('  SERVIDOR DA HOUSE MIX rodando');
  console.log(`  Interface dos musicos:  http://localhost:${config.servidor.port}/musico`);
  console.log(`  Monitor da house mix:   http://localhost:${config.servidor.port}/monitor`);
  console.log('');
  console.log(`  Na rede, troque "localhost" pelo IP deste computador.`);
  console.log(`  Mesa configurada: ${config.mesa.host}:${config.mesa.port}`);
  console.log('============================================================');
});
