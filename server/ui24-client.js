// ============================================================================
//  UI24 CLIENT  -  fala o protocolo da Soundcraft Ui24R
// ============================================================================
//
//  A Ui24R roda um servidor web interno. A interface oficial dela conversa com
//  a mesa por um WebSocket na porta 80, no caminho "/socket.io/1/websocket/...".
//
//  Os comandos sao texto simples. Os principais que usamos aqui:
//
//    SETD^<caminho>^<valor>     -> altera um parametro (ex: volume)
//    GET <caminho>              -> pede o valor atual de um parametro
//    3:::<mensagem>             -> "wrapper" do socket.io antigo (engine 1)
//
//  O caminho de um canal DENTRO de um aux (a via de fone) e:
//
//    i.<canal>.aux.<aux>.value      -> nivel do canal <canal> no aux <aux>
//    i.<canal>.aux.<aux>.mix        -> on/off do canal no aux (mute do canal no fone)
//
//  Observacoes importantes:
//    - Indices de canal e aux comecam em 0.
//    - O valor de nivel vai de 0.0 (silencio) a 1.0 (maximo). Nao e dB direto;
//      e uma escala "de fader" de 0 a 1. Convertemos porcentagem <-> 0..1.
//    - Este protocolo foi mapeado pela comunidade (engenharia reversa). Os
//      comandos abaixo sao os mais estaveis entre firmwares. Se algo nao bater
//      na SUA mesa, o metodo caminhoNivel()/caminhoMix() e o unico ponto a ajustar.
//
//  Este modulo tenta duas formas de conexao, nesta ordem:
//    1) socket.io engine 1 (formato "3:::MSG") -> mesas/firmwares mais antigos
//    2) WebSocket "cru" (envia a MSG direto)   -> nosso SIMULADOR e alguns fw
//  O SIMULADOR aceita as duas, entao voce testa sem se preocupar com isso.
// ============================================================================

import WebSocket from 'ws';
import { EventEmitter } from 'node:events';

export class Ui24Client extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.host  IP da mesa (ou 127.0.0.1 para o simulador)
   * @param {number} opts.port  porta (80 na mesa real, 8001 no simulador)
   * @param {boolean} [opts.raw] força modo WebSocket cru (usado pelo simulador)
   */
  constructor({ host, port, raw = true }) {
    super();
    this.host = host;
    this.port = port;
    this.raw = raw;
    this.ws = null;
    this.conectado = false;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    // Detectado em tempo de execucao: a mesa REAL fala socket.io engine 1
    // (manda "1::" ao conectar e "2::" como heartbeat). Quando detectamos isso,
    // passamos a envelopar os comandos com "3:::" e a responder os heartbeats.
    // O SIMULADOR nao manda "1::"/"2::", entao continua no modo cru.
    this.socketio = false;

    // Cache do ultimo estado conhecido de cada "caminho".
    // Assim, quando um musico entra, ja mandamos pra ele o estado atual
    // sem precisar interrogar a mesa de novo.
    this.estado = new Map(); // caminho -> valor (string ou numero)
  }

  // ---- Caminhos do protocolo -------------------------------------------------

  /** Caminho do NIVEL de um canal dentro de um aux (fone).
   *  @param {string} tipo  prefixo do tipo de canal na mesa: "i" = entrada
   *    normal (canais 1-24), "l" = Line In estereo (canais dedicados, fora
   *    da numeracao 1-24). Default "i" para nao quebrar o uso existente. */
  caminhoNivel(canal, aux, tipo = 'i') {
    return `${tipo}.${canal}.aux.${aux}.value`;
  }

  /** Caminho do MUTE (on/off do canal naquele fone).
   *  O campo real e' "<tipo>.<canal>.aux.<aux>.mute" (0=ouvindo, 1=mutado).
   *  O campo ".mix" existe so no lado esquerdo do par estereo e nao e' o
   *  controle de mute — era pra onde o app escrevia por engano. */
  caminhoMix(canal, aux, tipo = 'i') {
    return `${tipo}.${canal}.aux.${aux}.mute`;
  }

  /** Caminho do NIVEL MASTER do proprio aux (volume geral do fone).
   *  Na Ui24R o fader do master do aux e' "a.<n>.mix" (o ".value" nao e' o
   *  fader real — era pra onde o app escrevia por engano). */
  caminhoMasterAux(aux) {
    return `a.${aux}.mix`;
  }

  /**
   * Se o aux faz parte de um par ESTEREO, devolve o indice do parceiro; senao null.
   * Detecta pelo nome: quando dois auxes vizinhos tem o MESMO nome na mesa
   * (ex: a.8.name = a.9.name = "BATERISTA"), sao um par estereo linkado.
   * Precisamos escrever nos DOIS lados, porque a mesa nao espelha sozinha
   * quando o comando vem por fora (canais e master).
   */
  _auxParceiro(aux) {
    const nome = this.estado.get(`a.${aux}.name`);
    if (!nome) return null;
    if (this.estado.get(`a.${aux + 1}.name`) === nome) return aux + 1;
    if (this.estado.get(`a.${aux - 1}.name`) === nome) return aux - 1;
    return null;
  }

  // ---- Conexao ---------------------------------------------------------------

  conectar() {
    // Conecta na RAIZ "/". A mesa real fala socket.io engine 1 tambem por aqui:
    // manda "1::" e "2::", aceita nossos comandos "3:::SETD^..." E retransmite
    // (broadcast) as mudancas feitas por outros clientes de volta para nos —
    // por isso a raiz e' o caminho certo (a sessao dedicada nao recebia esses
    // broadcasts inbound). O SIMULADOR tambem atende na raiz, em modo cru.
    const url = `ws://${this.host}:${this.port}/`;
    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      this._agendarReconexao(err.message);
      return;
    }

    this.ws.on('open', () => {
      this.conectado = true;
      this.emit('status', { conectado: true, host: this.host, port: this.port });
      // Pede um "snapshot" do estado atual. Na mesa real isso dispara um
      // despejo de todos os parametros; o simulador tambem responde.
      this._enviarBruto('ALIVE');
      this._enviarBruto('GETSTAT'); // pedido de estado (aceito pelo simulador)
    });

    this.ws.on('message', (data) => {
      const texto = data.toString();
      // Uma mensagem pode conter varias linhas.
      for (const linha of texto.split('\n')) {
        const bruta = linha.trim();
        if (!bruta) continue;
        // socket.io engine 1:
        //   "1::" = handshake "conectado"      -> a mesa fala socket.io
        //   "2::" = heartbeat (a cada instante) -> PRECISA responder "2::",
        //           senao a mesa fecha a conexao em ~20s (era a causa das quedas).
        if (bruta === '1::') { this._ativarSocketio(); continue; }
        if (bruta === '2::') { this._ativarSocketio(); this._responderHeartbeat(); continue; }
        const msg = this._desembrulhar(bruta);
        if (msg) this._processarMensagem(msg);
      }
    });

    this.ws.on('close', () => {
      this.conectado = false;
      clearInterval(this.heartbeatTimer);
      this.emit('status', { conectado: false, host: this.host, port: this.port });
      this._agendarReconexao('conexao fechada');
    });

    this.ws.on('error', (err) => {
      // O 'close' vem logo depois e cuida da reconexao.
      this.emit('erro', err.message);
    });
  }

  _agendarReconexao(motivo) {
    if (this.reconnectTimer) return;
    this.emit('log', `Reconectando com a mesa em 3s (motivo: ${motivo})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.conectar();
    }, 3000);
  }

  // ---- Envio / recepcao de baixo nivel --------------------------------------

  /** Remove o wrapper "3:::" do socket.io engine 1, se existir. */
  _desembrulhar(linha) {
    if (!linha) return null;
    if (linha.startsWith('3:::')) return linha.slice(4);
    // Pings/pongs do socket.io engine 1
    if (linha === '2::' || linha.startsWith('1::')) return null;
    return linha;
  }

  /** Marca que a mesa fala socket.io e liga o keep-alive + refresh (uma vez). */
  _ativarSocketio() {
    if (this.socketio) return;
    this.socketio = true;
    // A mesa PARA de empurrar mudancas ao vivo depois de alguns segundos numa
    // conexao de longa duracao. Entao, a cada 2s:
    //   1) mandamos "2::" (heartbeat) para nao sermos desconectados;
    //   2) pedimos GETSTAT/ALIVE, e a mesa re-despeja o estado atual — assim o
    //      nosso cache fica sempre fresco e o app reflete o que muda na mesa
    //      (o dedup em _processarMensagem evita repassar o que nao mudou).
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      this._responderHeartbeat();
      this._enviarBruto('ALIVE');
      this._enviarBruto('GETSTAT');
    }, 2000);
  }

  /** Responde ao heartbeat do socket.io engine 1 (mantem a conexao viva). */
  _responderHeartbeat() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send('2::');
  }

  /** Envia uma mensagem crua para a mesa (com wrapper "3:::" se for socket.io). */
  _enviarBruto(msg) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    // Se detectamos socket.io engine 1 (mesa real), a mensagem TEM que ir
    // envelopada como "3:::<msg>". No simulador (cru) enviamos direto.
    const usarWrapper = this.socketio || !this.raw;
    const payload = usarWrapper ? `3:::${msg}` : msg;
    this.ws.send(payload);
    // Espelha para o "modo espiao".
    this.emit('bruto', { direcao: 'enviado', msg });
  }

  /** Interpreta uma mensagem recebida da mesa e atualiza o cache de estado. */
  _processarMensagem(msg) {
    // Formato tipico de atualizacao de valor:
    //   SETD^i.5.aux.0.value^0.72
    // ou, em alguns firmwares, sem o SETD (apenas caminho^valor).
    let corpo = msg;
    if (corpo.startsWith('SETD^')) corpo = corpo.slice(5);
    else if (corpo.startsWith('SETS^')) corpo = corpo.slice(5); // string
    else if (corpo.startsWith('SET^')) corpo = corpo.slice(4);

    const idx = corpo.indexOf('^');
    if (idx === -1) return; // nao e um par caminho^valor

    const caminho = corpo.slice(0, idx);
    const valorStr = corpo.slice(idx + 1);
    const valor = this._parseValor(valorStr);

    // DEDUP: como pedimos GETSTAT periodicamente (a mesa re-despeja o estado
    // inteiro), so seguimos adiante quando o valor REALMENTE mudou. Isso evita
    // inundar os musicos e o espiao com repeticoes a cada ciclo de refresh —
    // o espiao passa a mostrar so as mudancas de verdade (otimo p/ mapear).
    if (this.estado.get(caminho) === valor) return;
    this.estado.set(caminho, valor);

    // Espelha a mudanca para o "modo espiao".
    this.emit('bruto', { direcao: 'recebido', msg });
    // Avisa quem estiver ouvindo (o servidor) que um parametro mudou.
    this.emit('parametro', { caminho, valor });
  }

  _parseValor(str) {
    const n = Number(str);
    return Number.isFinite(n) && str.trim() !== '' ? n : str;
  }

  // ---- API de alto nivel (usada pelo servidor) ------------------------------

  /**
   * Define o nivel de um canal no fone (aux) de um musico.
   * @param {number} canal  indice do canal dentro do seu "tipo" (0..23 para
   *   entradas normais; 0..1 para Line In)
   * @param {number} aux    indice do aux/fone (0..9)
   * @param {number} nivel  0.0 a 1.0
   * @param {string} tipo   "i" (entrada normal, default) ou "l" (Line In)
   */
  setNivelCanalAux(canal, aux, nivel, tipo = 'i') {
    const v = this._clamp01(nivel);
    const txt = v.toFixed(4);
    const caminho = this.caminhoNivel(canal, aux, tipo);
    this._aplicarSetD(caminho, v, txt);
    const par = this._auxParceiro(aux);
    if (par != null) this._aplicarSetD(this.caminhoNivel(canal, par, tipo), v, txt);
    return { caminho, valor: v };
  }

  /**
   * Liga/desliga (mute) um canal no fone de um musico.
   * @param {boolean} ligado  true = ouvindo, false = mutado
   * @param {string} tipo     "i" (entrada normal, default) ou "l" (Line In)
   *
   * O campo real na mesa e' "mute" (1 = mutado, 0 = ouvindo) — o INVERSO do
   * "ligado" que a API usa. Convertendo aqui, quem chama (index.js, app do
   * musico) continua raciocinando em termos de "ligado/on", sem precisar
   * saber do detalhe do protocolo.
   */
  setMixCanalAux(canal, aux, ligado, tipo = 'i') {
    const muteValor = ligado ? 0 : 1;
    const caminho = this.caminhoMix(canal, aux, tipo);
    this._aplicarSetD(caminho, muteValor, String(muteValor));
    const par = this._auxParceiro(aux);
    if (par != null) this._aplicarSetD(this.caminhoMix(canal, par, tipo), muteValor, String(muteValor));
    return { caminho, valor: ligado ? 1 : 0 };
  }

  /** Volume geral (master) do fone de um musico. */
  setMasterAux(aux, nivel) {
    const v = this._clamp01(nivel);
    const txt = v.toFixed(4);
    const caminho = this.caminhoMasterAux(aux);
    this._aplicarSetD(caminho, v, txt);
    const par = this._auxParceiro(aux);
    if (par != null) this._aplicarSetD(this.caminhoMasterAux(par), v, txt);
    return { caminho, valor: v };
  }

  /** Atualiza o cache e manda um SETD para a mesa (usado pelos setters acima). */
  _aplicarSetD(caminho, valorNum, valorTexto) {
    this.estado.set(caminho, valorNum);
    this._enviarBruto(`SETD^${caminho}^${valorTexto}`);
  }

  /** Le o estado atual conhecido de um caminho (do cache). */
  getEstado(caminho) {
    return this.estado.has(caminho) ? this.estado.get(caminho) : null;
  }

  _clamp01(n) {
    if (typeof n !== 'number' || Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }
}
