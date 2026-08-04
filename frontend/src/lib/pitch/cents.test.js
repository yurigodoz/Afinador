import test from 'node:test';
import assert from 'node:assert/strict';

import { cordasDaAfinacao, midiParaFreq } from '../instrumentos.js';
import {
  LIMITE_FORA_DA_AFINACAO,
  cents,
  cordaMaisProxima,
  direcao,
  notaCromatica,
} from './cents.js';

test('cents mede a razão entre frequências', () => {
  assert.equal(cents(440, 440), 0);
  assert.ok(Math.abs(cents(880, 440) - 1200) < 1e-9, 'uma oitava = 1200 cents');
  assert.ok(Math.abs(cents(440, 880) + 1200) < 1e-9, 'uma oitava abaixo = −1200 cents');
  assert.ok(Math.abs(cents(440 * 2 ** (1 / 12), 440) - 100) < 1e-9, 'um semitom = 100 cents');
});

test('sinal do desvio indica a direção do ajuste (FR-7)', () => {
  const alvo = midiParaFreq(40); // E2
  assert.ok(cents(alvo * 0.99, alvo) < 0, 'abaixo do alvo deve dar negativo');
  assert.equal(direcao(-20), 'aperte');
  assert.equal(direcao(20), 'afrouxe');
  assert.equal(direcao(3), 'afinado');
  assert.equal(direcao(-5), 'afinado', 'a borda da tolerância conta como afinado');
});

test('cordaMaisProxima escolhe pela distância em cents (FR-5)', () => {
  const cordas = cordasDaAfinacao('violao', 'padrao');

  const resultado = cordaMaisProxima(midiParaFreq(45) * 1.003, cordas); // A2 levemente alto
  assert.equal(resultado.corda.nome, 'A2');
  assert.ok(resultado.cents > 0 && resultado.cents < 10);
  assert.equal(resultado.foraDaAfinacao, false);
});

test('oitavas do mesmo nome não colidem', () => {
  // DADGAD tem D2, D3 e D4 — a comparação por frequência absoluta tem de
  // distinguir as três, senão a corda errada acende na tela.
  const cordas = cordasDaAfinacao('violao', 'dadgad');

  assert.equal(cordaMaisProxima(midiParaFreq(38), cordas).corda.nome, 'D2');
  assert.equal(cordaMaisProxima(midiParaFreq(50), cordas).corda.nome, 'D3');
  assert.equal(cordaMaisProxima(midiParaFreq(62), cordas).corda.nome, 'D4');

  // E as duas oitavas de A do mesmo preset.
  assert.equal(cordaMaisProxima(midiParaFreq(45), cordas).corda.nome, 'A2');
  assert.equal(cordaMaisProxima(midiParaFreq(57), cordas).corda.nome, 'A3');
});

test('acima de um semitom marca fora da afinação (FR-6)', () => {
  const cordas = cordasDaAfinacao('violao', 'padrao');

  // Um tom abaixo do E2: longe demais de qualquer corda do preset.
  const longe = cordaMaisProxima(midiParaFreq(38), cordas);
  assert.equal(longe.foraDaAfinacao, true);

  // Exatamente no limite ainda não é "fora".
  const noLimite = cordaMaisProxima(midiParaFreq(40) * 2 ** (99 / 1200), cordas);
  assert.equal(noLimite.foraDaAfinacao, false);
  assert.ok(Math.abs(noLimite.cents) < LIMITE_FORA_DA_AFINACAO);
});

test('cordaMaisProxima devolve null para entrada inválida', () => {
  const cordas = cordasDaAfinacao('violao', 'padrao');
  assert.equal(cordaMaisProxima(0, cordas), null);
  assert.equal(cordaMaisProxima(NaN, cordas), null);
  assert.equal(cordaMaisProxima(110, []), null);
});

test('notaCromatica identifica a nota e o desvio fora de qualquer preset', () => {
  const a4 = notaCromatica(440);
  assert.equal(a4.nome, 'A4');
  assert.ok(Math.abs(a4.cents) < 1e-9);

  const quaseC = notaCromatica(261.63);
  assert.equal(quaseC.nome, 'C4');
  assert.ok(Math.abs(quaseC.cents) < 1);

  // A meio caminho entre duas notas o desvio se aproxima de ±50 cents.
  const meioCaminho = notaCromatica(440 * 2 ** (0.5 / 12));
  assert.ok(Math.abs(Math.abs(meioCaminho.cents) - 50) < 1e-6);
});

test('notaCromatica acompanha o diapasão', () => {
  const com432 = notaCromatica(432, 432);
  assert.equal(com432.nome, 'A4');
  assert.ok(Math.abs(com432.cents) < 1e-9);
});
