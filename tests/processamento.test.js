import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Ui24Client } from '../server/ui24-client.js';

test('Sem Gate e Comp seleciona PRE PROC apenas no envio do fone e pode voltar a POST PROC', () => {
  const mesa = new Ui24Client({ host: '127.0.0.1', port: 9 });
  const comandos = [];
  mesa._enviarBruto = (msg) => comandos.push(msg);
  const ligado = mesa.setSemProcessamentoCanalAux(2, 3, true);
  assert.equal(ligado.valor, 0);
  assert.deepEqual(ligado.auxes, [3]);
  assert.deepEqual(comandos, ['SETD^i.2.aux.3.postproc^0']);
  assert.equal(mesa.getEstado('i.2.aux.3.postproc'), 0);
  assert.equal(mesa.getEstado('i.2.gate.bypass'), null);
  assert.equal(mesa.getEstado('i.2.dyn.bypass'), null);
  assert.equal(mesa.getEstado('i.2.eq.bypass'), null);
  assert.equal(mesa.getEstado('i.2.aux.3.post'), null);
  const desligado = mesa.setSemProcessamentoCanalAux(2, 3, false);
  assert.equal(desligado.valor, 1);
  assert.equal(comandos.at(-1), 'SETD^i.2.aux.3.postproc^1');
});

test('respeita o tipo Line In e espelha os dois lados do fone estereo', () => {
  const mesa = new Ui24Client({ host: '127.0.0.1', port: 9 });
  const comandos = [];
  mesa._enviarBruto = (msg) => comandos.push(msg);
  mesa.estado.set('a.8.name', 'Fone estereo');
  mesa.estado.set('a.9.name', 'Fone estereo');
  const resultado = mesa.setSemProcessamentoCanalAux(0, 8, true, 'l');
  assert.deepEqual(resultado.auxes, [8, 9]);
  assert.deepEqual(comandos, ['SETD^l.0.aux.8.postproc^0', 'SETD^l.0.aux.9.postproc^0']);
  assert.equal(mesa.getEstado('l.0.aux.9.postproc'), 0);
});
