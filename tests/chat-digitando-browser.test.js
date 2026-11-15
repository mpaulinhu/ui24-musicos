import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { setTimeout as aguardar } from 'node:timers/promises';
import { chromium } from 'playwright';
import WebSocket from 'ws';

const raiz = fileURLToPath(new URL('../', import.meta.url));

test('digitacao entre musicos e House Mix no navegador, com envio, pausa e reconexao', { timeout: 45000 }, async (t) => {
  // Copia isolada: nunca inicia outra conexao com a mesa real nem altera a config local.
  const pasta = mkdtempSync(path.join(tmpdir(), 'ui24-chat-'));
  let servidor;
  let navegador;
  const sockets = [];
  t.after(async () => {
    for (const socket of sockets) socket.terminate();
    if (navegador) await navegador.close();
    if (servidor && servidor.exitCode === null) { servidor.kill(); await once(servidor, 'exit'); }
    assert.equal(path.dirname(pasta), path.resolve(tmpdir()));
    assert.ok(path.basename(pasta).startsWith('ui24-chat-'));
    rmSync(pasta, { recursive: true, force: true });
  });
  cpSync(path.join(raiz, 'server'), path.join(pasta, 'server'), { recursive: true, filter: (origem) => path.basename(origem) !== 'config.json' });
  cpSync(path.join(raiz, 'public'), path.join(pasta, 'public'), { recursive: true });
  mkdirSync(path.join(pasta, 'node_modules'), { recursive: true });
  cpSync(path.join(raiz, 'node_modules/ws'), path.join(pasta, 'node_modules/ws'), { recursive: true });
  writeFileSync(path.join(pasta, 'package.json'), '{"type":"module"}');
  const reserva = net.createServer();
  reserva.listen(0, '127.0.0.1');
  await once(reserva, 'listening');
  const porta = reserva.address().port;
  await new Promise((resolve) => reserva.close(resolve));
  const cfg = JSON.parse(readFileSync(path.join(raiz, 'server/config.default.json'), 'utf8'));
  cfg.mesa = { host: '127.0.0.1', port: 9 };
  cfg.servidor.port = porta;
  cfg.musicos = [{ id: 'ana', nome: 'Ana', senha: 'teste', aux: 0, canais: [] }, { id: 'bia', nome: 'Bia', senha: 'teste', aux: 1, canais: [] }];
  cfg.houseMix.senha = 'teste';
  writeFileSync(path.join(pasta, 'server/config.json'), JSON.stringify(cfg));
  servidor = spawn(process.execPath, ['server/index.js'], { cwd: pasta, stdio: 'pipe', windowsHide: true });
  let logs = '';
  servidor.stdout.on('data', (data) => { logs += data; });
  servidor.stderr.on('data', (data) => { logs += data; });
  const base = `http://127.0.0.1:${porta}`;
  let pronto = false;
  for (let i = 0; i < 100; i++) {
    try { pronto = (await fetch(`${base}/api/config`)).ok; } catch {}
    if (pronto) break;
    await aguardar(50);
  }
  assert.ok(pronto, logs);
  navegador = await chromium.launch({ headless: true });
  const erros = [];
  async function pagina(rota) {
    const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 } });
    const p = await contexto.newPage();
    p.on('pageerror', (error) => erros.push(error.message));
    await p.goto(base + rota);
    return p;
  }
  async function entrarMusico(id) {
    const p = await pagina('/musico/');
    await p.selectOption('#sel-musico', id);
    await p.fill('#inp-senha', 'teste');
    await p.click('#btn-entrar');
    await p.waitForSelector('#tela-mixer.ativa');
    await p.click('[data-aba="chat"]');
    return p;
  }
  async function status(p, texto) {
    await p.waitForFunction((esperado) => document.querySelector('#chat-digitando').textContent === esperado, texto, { timeout: 5000 });
  }
  const ana = await entrarMusico('ana');
  const bia = await entrarMusico('bia');
  const monitor = await pagina('/monitor');
  await monitor.fill('#inp-senha', 'teste');
  await monitor.click('#btn-entrar');
  await monitor.waitForSelector('#tela-monitor.ativa');

  await ana.fill('#chat-input', 'Rascunho privado');
  await status(monitor, 'Ana está digitando…');
  await status(bia, 'Ana está digitando…');
  await status(ana, '');
  assert.equal(await monitor.locator('#mensagens').innerText(), 'Aguardando mensagens dos músicos…');

  await bia.fill('#chat-input', 'Outro rascunho');
  await status(monitor, 'Ana e Bia estão digitando…');
  await status(ana, 'Bia está digitando…');
  await bia.fill('#chat-input', '');
  await status(monitor, 'Ana está digitando…');
  await ana.press('#chat-input', 'Enter');
  await status(monitor, '');
  await monitor.waitForFunction(() => document.querySelector('#mensagens').textContent.includes('Rascunho privado'));

  await monitor.locator('#resp-input').pressSequentially('Resposta da house', { delay: 50 });
  await status(ana, 'House Mix está digitando…');
  await status(bia, 'House Mix está digitando…');
  await status(monitor, '');
  await monitor.press('#resp-input', 'Enter');
  await status(ana, '');
  await status(bia, '');
  await ana.waitForFunction(() => document.querySelector('#chat-mensagens').textContent.includes('Resposta da house'));

  await ana.fill('#chat-input', 'Pausa');
  await status(monitor, 'Ana está digitando…');
  await status(monitor, ''); // pausa de 2 segundos
  await ana.fill('#chat-input', 'Sair do campo');
  await status(monitor, 'Ana está digitando…');
  await ana.locator('#chat-input').blur();
  await status(monitor, '');

  // Reconexao real do navegador: limpa os indicadores e refaz o login.
  await ana.fill('#chat-input', 'Antes de recarregar');
  await status(monitor, 'Ana está digitando…');
  await ana.reload();
  await ana.waitForSelector('#tela-mixer.ativa');
  await status(monitor, '');
  await ana.click('[data-aba="chat"]');
  await ana.fill('#chat-input', 'Depois de recarregar');
  await status(monitor, 'Ana está digitando…');
  await ana.fill('#chat-input', '');
  await status(monitor, '');

  // Uma conexao anonima nao pode falsificar quem esta digitando.
  const anonimo = new WebSocket(`ws://127.0.0.1:${porta}`);
  sockets.push(anonimo);
  await once(anonimo, 'open');
  anonimo.send(JSON.stringify({ tipo: 'chat_digitando', ativo: true, nome: 'Intruso' }));
  // O teste segue com uma mensagem autenticada; ela ordena o processamento no servidor.
  await bia.fill('#chat-input', 'Conferir autenticacao');
  await status(monitor, 'Bia está digitando…');
  await bia.fill('#chat-input', '');
  await status(monitor, '');
  // Com historico longo, o indicador precisa continuar dentro da tela da House Mix.
  await ana.evaluate(() => {
    for (let i = 0; i < 25; i++) enviar({ tipo: 'chat', texto: `Mensagem de teste ${i}` });
  });
  await monitor.waitForFunction(() => document.querySelector('#mensagens').textContent.includes('Mensagem de teste 24'));
  await ana.fill('#chat-input', 'Ainda escrevendo');
  await status(monitor, 'Ana está digitando…');
  const indicadorNaTela = await monitor.locator('#chat-digitando').evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight;
  });
  assert.equal(indicadorNaTela, true, 'O aviso de digitacao deve ficar visivel mesmo com muitas mensagens');
  await ana.fill('#chat-input', '');
  const semCache = await ana.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const assets = [...document.querySelectorAll('script[src], link[rel="stylesheet"]')]
      .map((el) => el.src || el.href).filter((url) => new URL(url).origin === location.origin);
    const ausentes = [];
    for (const url of assets) if (!await caches.match(url)) ausentes.push(new URL(url).pathname);
    return ausentes;
  });
  assert.deepEqual(semCache, [], 'O PWA deve guardar todas as dependencias locais para iniciar offline');
  assert.deepEqual(erros, []);
});
