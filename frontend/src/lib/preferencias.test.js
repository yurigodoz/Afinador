import test from 'node:test';
import assert from 'node:assert/strict';

import { A4_MAX, A4_MIN, A4_PADRAO } from './instrumentos.js';
import {
  PREFERENCIAS_PADRAO,
  afinacaoAoTrocarInstrumento,
  normalizarPreferencias,
  primeiraAfinacaoDe,
} from './preferencias.js';

test('entrada ausente ou inválida devolve os padrões', () => {
  for (const entrada of [null, undefined, 'texto', 42, []]) {
    assert.deepEqual(normalizarPreferencias(entrada), PREFERENCIAS_PADRAO);
  }
});

test('preferências válidas passam intactas', () => {
  const validas = { instrumentoId: 'baixo-4', afinacaoId: 'drop-d', a4: 442 };
  assert.deepEqual(normalizarPreferencias(validas), validas);
});

test('um campo inválido não derruba os outros', () => {
  // O conteúdo do armazenamento é entrada não confiável — pode vir de uma versão
  // anterior do app. Um instrumento que deixou de existir não pode levar junto
  // um diapasão que estava perfeitamente bom.
  const resultado = normalizarPreferencias({
    instrumentoId: 'teclado',
    afinacaoId: 'padrao',
    a4: 443,
  });

  assert.equal(resultado.instrumentoId, PREFERENCIAS_PADRAO.instrumentoId);
  assert.equal(resultado.a4, 443, 'o diapasão válido tinha de sobreviver');
});

test('afinação é validada contra o instrumento resolvido', () => {
  // 'drop-d' existe no violão e no baixo de 4, mas não no baixo de 5.
  const resultado = normalizarPreferencias({ instrumentoId: 'baixo-5', afinacaoId: 'drop-d' });
  assert.equal(resultado.afinacaoId, 'padrao');

  const valida = normalizarPreferencias({ instrumentoId: 'baixo-4', afinacaoId: 'drop-d' });
  assert.equal(valida.afinacaoId, 'drop-d');
});

test('diapasão fora da faixa é limitado, não descartado', () => {
  assert.equal(normalizarPreferencias({ a4: 300 }).a4, A4_MIN);
  assert.equal(normalizarPreferencias({ a4: 999 }).a4, A4_MAX);
  assert.equal(normalizarPreferencias({ a4: 440.7 }).a4, 441, 'valor fracionário é arredondado');
  assert.equal(normalizarPreferencias({ a4: NaN }).a4, A4_PADRAO);
  assert.equal(normalizarPreferencias({ a4: '442' }).a4, A4_PADRAO, 'string não conta como número');
});

test('normalizar é idempotente', () => {
  const uma = normalizarPreferencias({ instrumentoId: 'baixo-5', afinacaoId: 'drop-d', a4: 1000 });
  assert.deepEqual(normalizarPreferencias(uma), uma);
});

test('trocar de instrumento preserva a afinação equivalente quando existe', () => {
  // Quem estava em meio tom abaixo no violão espera continuar em meio tom abaixo
  // no baixo, não voltar ao padrão.
  assert.equal(afinacaoAoTrocarInstrumento('baixo-4', 'meio-tom-abaixo'), 'meio-tom-abaixo');
  assert.equal(afinacaoAoTrocarInstrumento('baixo-4', 'drop-d'), 'drop-d');
});

test('trocar para instrumento sem a afinação cai na primeira dele', () => {
  assert.equal(afinacaoAoTrocarInstrumento('baixo-5', 'dadgad'), 'padrao');
  assert.equal(primeiraAfinacaoDe('baixo-5'), 'padrao');
});

test('instrumento desconhecido não estoura ao buscar a primeira afinação', () => {
  assert.equal(typeof primeiraAfinacaoDe('trombone'), 'string');
});
