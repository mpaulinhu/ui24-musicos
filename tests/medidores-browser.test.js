import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cpSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as aguardar } from 'node:timers/promises';
import net from 'node:net';
import WebSocket, { WebSocketServer } from 'ws';
import { chromium } from 'playwright';

test('o medidor no celular acompanha o envio de cada aux e o mute, com sinal de entrada constante', { timeout: 30000 }, async (t) => {
  const raiz = fileURLToPath(new URL('../', import.meta.url));
  const pasta = mkdtempSync(path.join(tmpdir(), 'ui24-medidores-'));
  const mesa = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await once(mesa, 'listening');
  let servidor;
  let navegador;
  t.after(async () => {
    if (navegador) await navegador.close();
    if (servidor && servidor.exitCode === null) { servidor.kill(); await once(servidor, 'exit'); }
    for (const ws of mesa.clients) ws.terminate();
    await new Promise((resolve) => mesa.close(resolve));
    assert.equal(path.dirname(pasta), path.resolve(tmpdir()));
    assert.ok(path.basename(pasta).startsWith('ui24-medidores-'));
    rmSync(pasta, { recursive: true, force: true });
  });
  const estado = new Map([
    ['i.0.aux.0.value', 13 / 17], ['i.0.aux.0.postproc', 1], ['i.0.aux.0.post', 0],
    ['i.0.aux.1.value', 0], ['i.0.aux.1.postproc', 1], ['i.0.aux.1.post', 0],
  ]);
  const vu = Buffer.from([1, 0, 0, 0, 0, 0, 0, 0, 200, 180, 80, 0, 0, 0]).toString('base64');
  mesa.on('connection', (ws) => {
    const enviarEstado = () => { for (const [chave, valor] of estado) ws.send(`SETD^${chave}^${valor}`); };
    enviarEstado();
    ws.on('message', (data) => {
      const msg = data.toString();
      if (msg === 'GETSTAT') enviarEstado();
      if (msg.startsWith('SETD^')) {
        const [, chave, valor] = msg.split('^');
        estado.set(chave, Number(valor));
        ws.send(msg);
      }
    });
    const timer = setInterval(() => { if (ws.readyState === ws.OPEN) ws.send(`VU2^${vu}`); }, 50);
    ws.on('close', () => clearInterval(timer));
  });
  cpSync(path.join(raiz, 'server'), path.join(pasta, 'server'), { recursive: true, filter: (origem) => path.basename(origem) !== 'config.json' });
  cpSync(path.join(raiz, 'public'), path.join(pasta, 'public'), { recursive: true });
  mkdirSync(path.join(pasta, 'node_modules'));
  cpSync(path.join(raiz, 'node_modules/ws'), path.join(pasta, 'node_modules/ws'), { recursive: true });
  writeFileSync(path.join(pasta, 'package.json'), '{"type":"module"}');
  const reserva = net.createServer();
  reserva.listen(0, '127.0.0.1');
  await once(reserva, 'listening');
  const porta = reserva.address().port;
  await new Promise((resolve) => reserva.close(resolve));
  const cfg = {
    mesa: { host: '127.0.0.1', port: mesa.address().port }, servidor: { port: porta },
    canais: [{ id: 0, nome: 'Voz' }], muteGeral: [], totalCanais: 1, totalAuxes: 2,
    musicos: [{ id: 'ana', nome: 'Ana', senha: 'teste', aux: 0, canais: [0] }, { id: 'bia', nome: 'Bia', senha: 'teste', aux: 1, canais: [0] }],
    houseMix: { senha: 'teste' }, admin: { senha: 'teste' },
  };
  writeFileSync(path.join(pasta, 'server/config.json'), JSON.stringify(cfg));
  servidor = spawn(process.execPath, ['server/index.js'], { cwd: pasta, stdio: 'ignore', windowsHide: true });
  const base = `http://127.0.0.1:${porta}`;
  let pronto = false;
  for (let i = 0; i < 100; i++) {
    try { pronto = (await fetch(`${base}/api/config`)).ok; } catch {}
    if (pronto) break;
    await aguardar(50);
  }
  assert.ok(pronto);
  navegador = await chromium.launch({ headless: true });
  const erros = [];
  async function entrar(id) {
    const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 } });
    const page = await contexto.newPage();
    page.on('pageerror', (error) => erros.push(error.message));
    await page.goto(`${base}/musico`);
    await page.selectOption('#sel-musico', id);
    await page.fill('#inp-senha', 'teste');
    await page.click('#btn-entrar');
    await page.waitForSelector('#tela-mixer.ativa');
    return page;
  }
  const ana = await entrar('ana');
  const bia = await entrar('bia');
  const altura = () => parseFloat(document.querySelector('.vu-fill').style.height) || 0;
  await ana.waitForFunction(() => parseFloat(document.querySelector('.vu-fill').style.height) > 70);
  assert.equal(await bia.evaluate(altura), 0, 'o mesmo sinal nao deve aparecer em um envio fechado');
  const anaOutroCelular = await entrar('ana');
  const processamento = ana.locator('.btn-processamento').first();
  assert.equal(await processamento.getAttribute('aria-pressed'), 'false');
  await processamento.click();
  await anaOutroCelular.waitForFunction(() => document.querySelector('.btn-processamento').getAttribute('aria-pressed') === 'true');
  assert.equal(estado.get('i.0.aux.0.postproc'), 0);
  assert.equal(estado.get('i.0.aux.1.postproc'), 1);
  assert.equal(estado.get('i.0.aux.0.post'), 0);
  await ana.waitForFunction(() => parseFloat(document.querySelector('.vu-fill').style.height) > 80);
  await processamento.click();
  await anaOutroCelular.waitForFunction(() => document.querySelector('.btn-processamento').getAttribute('aria-pressed') === 'false');
  assert.equal(estado.get('i.0.aux.0.postproc'), 1);
  // Alteracao na interface oficial tambem atualiza os dois celulares.
  estado.set('i.0.aux.0.postproc', 0);
  for (const ws of mesa.clients) ws.send('SETD^i.0.aux.0.postproc^0');
  await ana.waitForFunction(() => document.querySelector('.btn-processamento').getAttribute('aria-pressed') === 'true');
  await anaOutroCelular.waitForFunction(() => document.querySelector('.btn-processamento').getAttribute('aria-pressed') === 'true');
  assert.equal(await bia.locator('.btn-processamento').first().getAttribute('aria-pressed'), 'false');
  await processamento.click();
  await anaOutroCelular.waitForFunction(() => document.querySelector('.btn-processamento').getAttribute('aria-pressed') === 'false');
  const anonimo = new WebSocket(`ws://127.0.0.1:${porta}`);
  await once(anonimo, 'open');
  anonimo.send(JSON.stringify({ tipo: 'set_processamento', canal: 0, semProcessamento: true }));
  await aguardar(75);
  assert.equal(estado.get('i.0.aux.0.postproc'), 1, 'conexao anonima nao pode mudar processamento');
  anonimo.close();
  const biaSocket = new WebSocket(`ws://127.0.0.1:${porta}`);
  await once(biaSocket, 'open');
  const loginBia = new Promise((resolve) => biaSocket.on('message', (raw) => { if (JSON.parse(raw).tipo === 'login_ok') resolve(); }));
  biaSocket.send(JSON.stringify({ tipo: 'login_musico', musicoId: 'bia', senha: 'teste' }));
  await loginBia;
  biaSocket.send(JSON.stringify({ tipo: 'set_processamento', canal: 999, semProcessamento: true }));
  biaSocket.send(JSON.stringify({ tipo: 'set_processamento', canal: 0, semProcessamento: 'true' }));
  await aguardar(75);
  assert.equal(estado.get('i.0.aux.1.postproc'), 1, 'canal fora da lista e valor invalido devem ser rejeitados');
  biaSocket.send(JSON.stringify({ tipo: 'set_processamento', canal: 0, aux: 0, semProcessamento: true }));
  await bia.waitForFunction(() => document.querySelector('.btn-processamento').getAttribute('aria-pressed') === 'true');
  assert.equal(estado.get('i.0.aux.0.postproc'), 1, 'aux enviado pelo cliente nao pode controlar o fone de outra pessoa');
  assert.equal(estado.get('i.0.aux.1.postproc'), 0);
  biaSocket.close();
  await bia.locator('.btn-processamento').first().click();
  await bia.waitForFunction(() => document.querySelector('.btn-processamento').getAttribute('aria-pressed') === 'false');
  await ana.click('.btn-on');
  await ana.waitForFunction(() => parseFloat(document.querySelector('.vu-fill').style.height) < 1);
  await ana.click('.btn-on');
  await ana.waitForFunction(() => parseFloat(document.querySelector('.vu-fill').style.height) > 70);
  // Fecha o fader usando o controle real da tela, sem modificar o sinal de entrada.
  const trilho = await ana.locator('.fader').boundingBox();
  await ana.mouse.click(trilho.x + trilho.width / 2, trilho.y + trilho.height - 1);
  await ana.waitForFunction(() => parseFloat(document.querySelector('.vu-fill').style.height) < 1);
  assert.ok(estado.get('i.0.aux.0.value') < 0.02);
  assert.equal(estado.get('i.0.aux.1.value'), 0);
  assert.deepEqual(erros, []);
});
