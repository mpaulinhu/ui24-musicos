import assert from 'node:assert/strict';
import { test } from 'node:test';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { chromium } from 'playwright';

test('mute no celular nao arrasta canais apos gesto cancelado, e swipe/fader continuam funcionando', { timeout: 30000 }, async (t) => {
  // Interface real, servidor de teste: nenhum comando chega a mesa da igreja.
  const canais = Array.from({ length: 20 }, (_, id) => ({ id, nome: `Canal ${id + 1}` }));
  const musico = { id: 'teste', nome: 'Teste', aux: 0, canais };
  const comandos = [];
  const erros = [];
  const servidor = http.createServer(async (req, res) => {
    const rota = new URL(req.url, 'http://localhost').pathname;
    if (rota === '/api/config') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ musicos: [musico], muteGeral: [], totalCanais: 20, totalAuxes: 1 }));
      return;
    }
    const arquivo = rota === '/musico' ? '/musico/index.html' : rota;
    if (!/^\/(musico|shared)\/[\w.-]+$/.test(arquivo)) { res.writeHead(404); res.end(); return; }
    try {
      const conteudo = await readFile(new URL(`../public${arquivo}`, import.meta.url));
      res.setHeader('Content-Type', arquivo.endsWith('.js') ? 'application/javascript' : arquivo.endsWith('.css') ? 'text/css' : 'text/html');
      res.end(conteudo);
    } catch { res.writeHead(404); res.end(); }
  });
  const wss = new WebSocketServer({ server: servidor });
  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ tipo: 'bemvindo', mesaConectada: true }));
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.tipo === 'login_musico') {
        ws.send(JSON.stringify({ tipo: 'login_ok', musico }));
        for (const canal of canais) ws.send(JSON.stringify({ tipo: 'estado_canal', canal: canal.id, nivel: 0.5, mix: 1, postproc: 1 }));
      } else comandos.push(msg);
    });
  });
  let navegador;
  t.after(async () => {
    if (navegador) await navegador.close();
    for (const ws of wss.clients) ws.terminate();
    await new Promise((resolve) => wss.close(resolve));
    await new Promise((resolve) => servidor.close(resolve));
  });
  servidor.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  navegador = await chromium.launch({ headless: true });
  const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pagina = await contexto.newPage();
  pagina.on('pageerror', (error) => erros.push(error.message));
  await pagina.goto(`http://127.0.0.1:${servidor.address().port}/musico`);
  await pagina.selectOption('#sel-musico', 'teste');
  await pagina.fill('#inp-senha', 'teste');
  await pagina.click('#btn-entrar');
  await pagina.waitForSelector('#tela-mixer.ativa');

  const deslocamento = await pagina.evaluate(() => {
    const cont = document.querySelector('#faders');
    cont.scrollLeft = 150;
    const antes = cont.scrollLeft;
    const cab = cont.querySelector('.canal-cab');
    const btn = cont.querySelector('.btn-on');
    const evento = (tipo, id, x, y) => new PointerEvent(tipo, { bubbles: true, pointerId: id, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, buttons: 1 });
    cab.dispatchEvent(evento('pointerdown', 1, 250, 200));
    cab.dispatchEvent(evento('pointercancel', 1, 250, 200));
    btn.dispatchEvent(evento('pointerdown', 2, 180, 450));
    btn.dispatchEvent(evento('pointermove', 2, 175, 451));
    const depois = cont.scrollLeft;
    btn.dispatchEvent(evento('pointerup', 2, 175, 451));
    cont.scrollLeft = 150;
    return { antes, depois };
  });
  assert.equal(deslocamento.depois, deslocamento.antes, 'mute herdou o arraste de um gesto cancelado');

  const cdp = await contexto.newCDPSession(pagina);
  const avancarFrame = () => pagina.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  async function tocar(tipo, x, y) {
    await cdp.send('Input.dispatchTouchEvent', { type: tipo, touchPoints: tipo === 'touchEnd' ? [] : [{ x, y, id: 0 }] });
    await avancarFrame();
  }
  await pagina.locator('#faders').evaluate((el) => { el.scrollLeft = 0; });
  const mute = pagina.locator('.btn-on').first();
  const botao = await mute.boundingBox();
  const inicio = await pagina.locator('#faders').evaluate((el) => el.scrollLeft);
  const bx = botao.x + botao.width / 2, by = botao.y + botao.height / 2;
  await tocar('touchStart', bx, by);
  await tocar('touchMove', bx - 18, by + 1);
  await tocar('touchEnd', 0, 0);
  assert.equal(await pagina.locator('#faders').evaluate((el) => el.scrollLeft), inicio, 'um toque no mute nao pode iniciar rolagem nativa');
  const antesTap = comandos.filter((msg) => msg.tipo === 'set_mix').length;
  await pagina.touchscreen.tap(bx, by);
  await pagina.waitForFunction(() => true); // deixa os eventos do WebSocket seguirem
  await pagina.waitForTimeout(75);
  assert.equal(comandos.filter((msg) => msg.tipo === 'set_mix').length, antesTap + 1);
  assert.equal(comandos.filter((msg) => msg.tipo === 'set_nivel').length, 0);

  const proc = await pagina.locator('.btn-processamento').first().boundingBox();
  const px = proc.x + proc.width / 2, py = proc.y + proc.height / 2;
  await tocar('touchStart', px, py);
  await tocar('touchMove', px - 18, py + 1);
  await tocar('touchEnd', 0, 0);
  assert.equal(await pagina.locator('#faders').evaluate((el) => el.scrollLeft), inicio, 'Sem Gate e Comp nao pode iniciar rolagem');
  const antesProc = comandos.filter((msg) => msg.tipo === 'set_processamento').length;
  await pagina.touchscreen.tap(px, py);
  await pagina.waitForTimeout(75);
  assert.equal(comandos.filter((msg) => msg.tipo === 'set_processamento').length, antesProc + 1);
  assert.equal(comandos.filter((msg) => msg.tipo === 'set_nivel').length, 0);

  const cabecalho = await pagina.locator('.canal-cab').nth(2).boundingBox();
  const cx = cabecalho.x + cabecalho.width / 2, cy = cabecalho.y + cabecalho.height / 2;
  await tocar('touchStart', cx, cy);
  await tocar('touchMove', cx - 50, cy);
  await tocar('touchMove', cx - 100, cy);
  await tocar('touchEnd', 0, 0);
  assert.ok(await pagina.locator('#faders').evaluate((el) => el.scrollLeft) > inicio + 30, 'o swipe intencional deve continuar rolando');
  await pagina.locator('#faders').evaluate((el) => { el.scrollLeft = 0; });
  const fader = await pagina.locator('.fader').first().boundingBox();
  const fx = fader.x + fader.width / 2, fy = fader.y + fader.height * 0.7;
  await tocar('touchStart', fx, fy);
  await tocar('touchMove', fx, fy - 35);
  await tocar('touchEnd', 0, 0);
  await pagina.waitForTimeout(75);
  assert.ok(comandos.some((msg) => msg.tipo === 'set_nivel'), 'arrastar o fader deve continuar alterando o nivel');
  assert.deepEqual(erros, []);
});
