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

  // Canal dentro de um aux (fone): i.<canal>.aux.<aux>.value|mix
  let m = /^i\.(\d+)\.aux\.(\d+)\.(value|mix)$/.exec(caminho);
  if (m) {
    const canal = Number(m[1]), aux = Number(m[2]), campo = m[3];
    const pct = campo === 'value' ? ` = ${Math.round(Number(valor) * 100)}%` : ` = ${valor}`;
    return `Canal ${canal} (mesa: canal ${canal + 1})  no  Aux ${aux} (mesa: fone ${aux + 1})  [${campo}]${pct}`;
  }
  // Master do aux: a.<aux>.value
  m = /^a\.(\d+)\.value$/.exec(caminho);
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
  if (!info) return;
  // Envia so para clientes cujo musico usa esse aux.
  for (const cli of clientes) {
    if (cli.tipo === 'musico' && cli.musico && cli.musico.aux === info.aux) {
      enviar(cli.ws, {
        tipo: 'parametro',
        canal: info.canal,
        aux: info.aux,
        campo: info.campo, // 'value' ou 'mix'
        valor,
      });
    }
  }
});

mesa.conectar();

// Extrai canal/aux/campo de um caminho tipo "i.5.aux.0.value"
function parseCaminho(caminho) {
  const m = /^i\.(\d+)\.aux\.(\d+)\.(value|mix)$/.exec(caminho);
  if (!m) return null;
  return { canal: Number(m[1]), aux: Number(m[2]), campo: m[3] };
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
      canais: m.canais,
    })),
  };
}

// ---------------------------------------------------------------------------
//  3) WebSocket (musicos e house mix conectam aqui)
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ server: httpServer });

// Lista de clientes conectados
const clientes = new Set();

// Historico curto do chat (para quem entra depois ver as ultimas)
const historicoChat = [];
const MAX_HISTORICO = 200; // chat geral do culto: guarda bastante mensagem

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
      const r = mesa.setNivelCanalAux(msg.canal, cli.musico.aux, msg.valor);
      // Ecoa de volta para o proprio musico confirmar (a mesa tambem ecoa)
      enviar(cli.ws, { tipo: 'parametro', canal: msg.canal, aux: cli.musico.aux, campo: 'value', valor: r.valor });
      break;
    }

    // ----- MUSICO MUTA/DESMUTA UM CANAL NO FONE DELE -----
    case 'set_mix': {
      if (!podeMexer(cli, msg.canal)) return;
      const r = mesa.setMixCanalAux(msg.canal, cli.musico.aux, !!msg.ligado);
      enviar(cli.ws, { tipo: 'parametro', canal: msg.canal, aux: cli.musico.aux, campo: 'mix', valor: r.valor });
      break;
    }

    // ----- MUSICO AJUSTA VOLUME GERAL DO FONE DELE -----
    case 'set_master': {
      if (cli.tipo !== 'musico' || !cli.autenticado) return;
      const r = mesa.setMasterAux(cli.musico.aux, msg.valor);
      enviar(cli.ws, { tipo: 'master', aux: cli.musico.aux, valor: r.valor });
      break;
    }

    // ----- CHAT: musico manda mensagem para a house mix -----
    case 'chat': {
      if (!cli.autenticado) return;
      const item = {
        de: cli.nome || 'Anonimo',
        papel: cli.tipo,
        texto: String(msg.texto || '').slice(0, 300),
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

    // ----- HOUSE MIX responde no chat (opcional) -----
    case 'chat_resposta': {
      if (cli.tipo !== 'housemix') return;
      const item = {
        de: 'House Mix',
        papel: 'housemix',
        texto: String(msg.texto || '').slice(0, 300),
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

// Envia o estado atual (do cache da mesa) de cada canal do fone do musico.
function enviarEstadoInicial(cli) {
  const aux = cli.musico.aux;
  for (const c of cli.musico.canais) {
    const nivel = mesa.getEstado(mesa.caminhoNivel(c.id, aux));
    const mix = mesa.getEstado(mesa.caminhoMix(c.id, aux));
    enviar(cli.ws, {
      tipo: 'estado_canal',
      canal: c.id,
      aux,
      nivel: nivel == null ? 0.5 : nivel,
      mix: mix == null ? 1 : mix,
    });
  }
  const master = mesa.getEstado(mesa.caminhoMasterAux(aux));
  enviar(cli.ws, { tipo: 'master', aux, valor: master == null ? 0.75 : master });
}

// ---- utilidades de envio ---------------------------------------------------
let _idChat = 1;
function proximoIdChat() {
  return _idChat++;
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
      online.push({ nome: c.nome, aux: c.musico.aux });
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
