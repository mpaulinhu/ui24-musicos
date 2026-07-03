// ============================================================================
//  SIMULADOR DA UI24R  -  finge ser a mesa, para voce testar em casa
// ============================================================================
//
//  Ele sobe um WebSocket na porta 8001 e:
//    - Aceita os mesmos comandos que a mesa real (SETD^caminho^valor)
//    - Guarda o estado de cada parametro
//    - Responde a GETSTAT despejando o estado atual
//    - Reflete ("echo") toda alteracao para TODOS os clientes conectados,
//      exatamente como a mesa faz (assim, se dois musicos mexem no mesmo
//      canal, os dois veem a mudanca).
//
//  Rode com:  npm run sim
//  Depois rode o servidor com: npm start
//
//  Quando for pra igreja, voce NAO usa este arquivo: o servidor conecta
//  direto no IP real da mesa (basta trocar em server/config.js).
// ============================================================================

import { WebSocketServer } from 'ws';

const PORTA = 8001;

// Estado simulado da "mesa": caminho -> valor
const estado = new Map();

// Inicializa alguns valores padrao para 24 canais x 10 auxes
for (let aux = 0; aux < 10; aux++) {
  for (let canal = 0; canal < 24; canal++) {
    estado.set(`i.${canal}.aux.${aux}.value`, 0.5); // meio volume
    estado.set(`i.${canal}.aux.${aux}.mix`, 1);     // ligado
  }
  estado.set(`a.${aux}.value`, 0.75); // master do aux
}

const wss = new WebSocketServer({ port: PORTA });

console.log('============================================================');
console.log('  SIMULADOR DA UI24R rodando');
console.log(`  Escutando em ws://127.0.0.1:${PORTA}`);
console.log('  (Isso finge ser a mesa. Deixe esta janela aberta.)');
console.log('============================================================');

function desembrulhar(linha) {
  if (linha.startsWith('3:::')) return linha.slice(4);
  return linha;
}

wss.on('connection', (ws) => {
  console.log('[SIM] Servidor conectou na "mesa".');

  ws.on('message', (data) => {
    const texto = data.toString();
    for (const bruta of texto.split('\n')) {
      const linha = desembrulhar(bruta.trim());
      if (!linha) continue;

      if (linha === 'ALIVE') {
        ws.send('ALIVE');
        continue;
      }

      if (linha === 'GETSTAT') {
        // Despeja todo o estado atual, uma linha por parametro.
        for (const [caminho, valor] of estado.entries()) {
          ws.send(`SETD^${caminho}^${valor}`);
        }
        console.log('[SIM] Enviei snapshot completo do estado.');
        continue;
      }

      // Comando de alteracao: SETD^caminho^valor
      let corpo = linha;
      if (corpo.startsWith('SETD^')) corpo = corpo.slice(5);

      const idx = corpo.indexOf('^');
      if (idx === -1) continue;

      const caminho = corpo.slice(0, idx);
      const valorStr = corpo.slice(idx + 1);
      const valor = Number(valorStr);
      const valorFinal = Number.isFinite(valor) ? valor : valorStr;

      estado.set(caminho, valorFinal);
      console.log(`[SIM] ${caminho} = ${valorFinal}`);

      // Reflete para TODOS os clientes (como a mesa real faz).
      const echo = `SETD^${caminho}^${valorFinal}`;
      for (const cliente of wss.clients) {
        if (cliente.readyState === ws.OPEN) cliente.send(echo);
      }
    }
  });

  ws.on('close', () => console.log('[SIM] Servidor desconectou.'));
});
