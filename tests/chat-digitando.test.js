import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChatDigitando } from '../server/chat-digitando.js';

function musico(id, nome = id) {
  return { autenticado: true, tipo: 'musico', musico: { id }, nome };
}
const house = () => ({ autenticado: true, tipo: 'housemix', nome: 'House Mix' });

test('somente participantes autenticados podem indicar digitacao', () => {
  const estado = new ChatDigitando(() => {});
  estado.atualizar({ autenticado: false, tipo: 'musico', nome: 'Intruso' }, true);
  estado.atualizar({ autenticado: true, tipo: 'espiao', nome: 'Espiao' }, true);
  assert.deepEqual(estado.pessoasPara(house()), []);
});

test('usa a identidade autenticada, inclui a House Mix e exclui a propria pessoa', (t) => {
  const estado = new ChatDigitando(() => {});
  const ana = musico('ana', 'Ana');
  const monitor = house();
  t.after(() => { estado.parar(ana); estado.parar(monitor); });
  estado.atualizar(ana, true);
  estado.atualizar(monitor, true);
  assert.deepEqual(estado.pessoasPara(monitor), [{ id: 'musico:ana', nome: 'Ana' }]);
  assert.deepEqual(estado.pessoasPara(ana), [{ id: 'housemix', nome: 'House Mix' }]);
  assert.deepEqual(estado.pessoasPara(musico('ana')), [{ id: 'housemix', nome: 'House Mix' }]);
});

test('deduplica dispositivos e so remove a pessoa quando todos param', () => {
  const estado = new ChatDigitando(() => {});
  const celular = musico('ana', 'Ana');
  const tablet = musico('ana', 'Ana');
  estado.atualizar(celular, true);
  estado.atualizar(tablet, true);
  assert.equal(estado.pessoasPara(house()).length, 1);
  estado.parar(celular);
  assert.equal(estado.pessoasPara(house()).length, 1);
  estado.atualizar(tablet, false);
  assert.deepEqual(estado.pessoasPara(house()), []);
});

test('expira e renova a digitacao sem transmitir cada tecla', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let mudancas = 0;
  const estado = new ChatDigitando(() => mudancas++);
  const ana = musico('ana');
  estado.atualizar(ana, true);
  t.mock.timers.tick(4000);
  estado.atualizar(ana, true);
  assert.equal(mudancas, 1);
  t.mock.timers.tick(4000);
  assert.equal(estado.pessoasPara(house()).length, 1);
  t.mock.timers.tick(1000);
  assert.deepEqual(estado.pessoasPara(house()), []);
  assert.equal(mudancas, 2);
});

test('parar na desconexao remove imediatamente e permite trocar de usuario', () => {
  const estado = new ChatDigitando(() => {});
  const cli = musico('ana');
  estado.atualizar(cli, true);
  estado.parar(cli);
  cli.musico.id = 'bia';
  cli.nome = 'Bia';
  estado.atualizar(cli, true);
  assert.deepEqual(estado.pessoasPara(house()), [{ id: 'musico:bia', nome: 'Bia' }]);
  estado.parar(cli);
  assert.deepEqual(estado.pessoasPara(house()), []);
});
