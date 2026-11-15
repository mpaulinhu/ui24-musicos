import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Ui24Client } from '../server/ui24-client.js';
import { nivelEnviadoAoAux, aplicarFaderAoMedidor } from '../server/medidores.js';

const UNIDADE = 13 / 17; // 0 dB na escala de fader da Ui24R.
const canal = { id: 0 };
const dados = { input: [0.8], line: [0.7], pre: { input: [0.9], line: [0.85] }, posFader: { input: [0.3], line: [0.2] } };
const estadoPadrao = () => new Map([
  ['i.0.aux.0.value', UNIDADE], ['i.0.aux.0.postproc', 1],
  ['l.0.aux.0.value', UNIDADE], ['l.0.aux.0.postproc', 1],
]);

test('decodifica sinais antes do processamento, apos processamento e apos fader, inclusive Line In', () => {
  const mesa = new Ui24Client({ host: '127.0.0.1', port: 9 });
  const bytes = Buffer.from([1, 0, 0, 0, 0, 0, 1, 0, 200, 160, 80, 0, 0, 0, 180, 140, 60, 0, 0, 0]);
  const vu = mesa._decodificarVU(bytes.toString('base64'));
  const escala = 0.004167508166392142;
  assert.equal(vu.input[0], 160 * escala);
  assert.equal(vu.pre.input[0], 200 * escala);
  assert.equal(vu.posFader.input[0], 80 * escala);
  assert.equal(vu.line[0], 140 * escala);
  assert.equal(vu.pre.line[0], 180 * escala);
  assert.equal(vu.posFader.line[0], 60 * escala);
});

test('fader em 0 dB preserva o sinal e fader fechado zera', () => {
  assert.ok(Math.abs(aplicarFaderAoMedidor(0.8, UNIDADE) - 0.8) < 0.001);
  assert.equal(aplicarFaderAoMedidor(0.8, 0), 0);
  assert.equal(aplicarFaderAoMedidor(0, 1), 0);
  assert.ok(aplicarFaderAoMedidor(0.8, 0.5) < 0.8);
  assert.ok(aplicarFaderAoMedidor(0.8, 1) > 0.8);
  assert.equal(aplicarFaderAoMedidor(0.99, 1), 1);
});

test('cada fone recebe um medidor diferente conforme o seu envio', () => {
  const estado = estadoPadrao();
  estado.set('i.0.aux.1.value', 0.5);
  const aux0 = nivelEnviadoAoAux(dados, estado, canal, 0);
  const aux1 = nivelEnviadoAoAux(dados, estado, canal, 1);
  assert.ok(aux0 > aux1);
  assert.ok(Math.abs(aux0 - 0.8) < 0.001);
  estado.set('i.0.aux.0.value', 0);
  assert.equal(nivelEnviadoAoAux(dados, estado, canal, 0), 0);
  estado.set('i.0.aux.1.mute', 1);
  assert.equal(nivelEnviadoAoAux(dados, estado, canal, 1), 0);
});

test('PRE e POST selecionam os sinais corretos, sem usar o fader principal em um envio PRE', () => {
  const estado = estadoPadrao();
  assert.ok(Math.abs(nivelEnviadoAoAux(dados, estado, canal, 0) - 0.8) < 0.001);
  estado.set('i.0.aux.0.post', 1);
  assert.ok(Math.abs(nivelEnviadoAoAux(dados, estado, canal, 0) - 0.3) < 0.001);
  estado.set('i.0.aux.0.post', 0);
  estado.set('i.0.aux.0.postproc', 0);
  assert.ok(Math.abs(nivelEnviadoAoAux(dados, estado, canal, 0) - 0.9) < 0.001);
});

test('mute geral respeita o vinculo de mute do aux e forceunmute', () => {
  const estado = estadoPadrao();
  estado.set('i.0.mute', 1);
  assert.ok(nivelEnviadoAoAux(dados, estado, canal, 0) > 0);
  estado.set('settings.auxmutelink', 1);
  assert.equal(nivelEnviadoAoAux(dados, estado, canal, 0), 0);
  estado.set('i.0.forceunmute', 1);
  assert.ok(nivelEnviadoAoAux(dados, estado, canal, 0) > 0);
});

test('mute por grupo, Mute All e VCA tambem zeram envios com mute vinculado', () => {
  for (const parametros of [
    [['mgmask', 2], ['i.0.mgmask', 2]],
    [['mgmask', 1 << 23]],
    [['i.0.vca', 0], ['v.0.mute', 1]],
    [['i.0.vca', 0], ['mgmask', 4], ['v.0.mgmask', 4]],
  ]) {
    const estado = estadoPadrao();
    estado.set('settings.auxmutelink', 1);
    for (const [chave, valor] of parametros) estado.set(chave, valor);
    assert.equal(nivelEnviadoAoAux(dados, estado, canal, 0), 0, JSON.stringify(parametros));
    estado.set('i.0.forceunmute', 1);
    assert.ok(nivelEnviadoAoAux(dados, estado, canal, 0) > 0);
  }
});

test('decoder rejeita blocos truncados e preserva picos antes da atenuacao do envio', () => {
  const mesa = new Ui24Client({ host: '127.0.0.1', port: 9 });
  const bytes = Buffer.from([1, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 0, 0, 0]);
  assert.equal(mesa._decodificarVU(bytes.subarray(0, 13).toString('base64')), null);
  assert.ok(mesa._decodificarVU(bytes.toString('base64')).input[0] > 1);
});

test('usa o indice da mesa e o tipo do canal, inclusive Line In e pares estereo independentes', () => {
  const estado = estadoPadrao();
  const line = { id: 25, tipo: 'l', canalMesa: 0, parceiro: 26 };
  assert.ok(Math.abs(nivelEnviadoAoAux(dados, estado, line, 0) - 0.7) < 0.001);
  assert.equal(nivelEnviadoAoAux(dados, estado, { id: 26, tipo: 'l', canalMesa: 1 }, 0), 0);
});

test('estado desconhecido, sinal ausente ou valores invalidos nao mostram um falso nivel de saida', () => {
  assert.equal(nivelEnviadoAoAux(dados, new Map(), canal, 0), 0);
  assert.equal(nivelEnviadoAoAux({}, estadoPadrao(), canal, 0), 0);
  assert.equal(aplicarFaderAoMedidor(NaN, UNIDADE), 0);
  assert.equal(aplicarFaderAoMedidor(0.8, NaN), 0);
});
