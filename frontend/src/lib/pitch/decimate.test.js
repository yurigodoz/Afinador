import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PERFIL_BAIXO,
  PERFIL_VIOLAO,
  fatorDeDecimacao,
  tamanhoDeJanela,
} from '../instrumentos.js';
import { LIMIAR_SILENCIO_DBFS, criarDecimador, nivelDbfs, temSinal } from './decimate.js';
import { SAMPLE_RATE, senoide } from './sinais.helper.js';

test('decimação reduz o tamanho pelo fator', () => {
  const d2 = criarDecimador(4096, 2);
  assert.equal(d2.tamanhoSaida, 2048);

  const d4 = criarDecimador(8192, 4);
  assert.equal(d4.tamanhoSaida, 2048);
});

test('os dois perfis convergem para ~2048 amostras por janela, em qualquer taxa', () => {
  // Não é coincidência: é o que faz os dois custarem quase o mesmo no laço (D11).
  // E vale em 44,1 / 48 / 96 kHz porque janela e decimação são derivadas da taxa,
  // não constantes — ver `instrumentos.js`.
  for (const taxa of [44100, 48000, 96000]) {
    for (const perfil of [PERFIL_VIOLAO, PERFIL_BAIXO]) {
      const decimador = criarDecimador(
        tamanhoDeJanela(perfil, taxa),
        fatorDeDecimacao(perfil, taxa),
      );
      assert.ok(
        decimador.tamanhoSaida >= 1024 && decimador.tamanhoSaida <= 4096,
        `${perfil.id} a ${taxa} Hz deu ${decimador.tamanhoSaida} amostras por janela`,
      );
    }
  }
});

test('fator 1 passa o sinal adiante sem alterar', () => {
  const decimador = criarDecimador(8, 1);
  const entrada = Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...decimador.decimar(entrada)], [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('decimação por média de blocos', () => {
  const decimador = criarDecimador(8, 2);
  const entrada = Float32Array.from([0, 2, 4, 6, 8, 10, 12, 14]);
  assert.deepEqual([...decimador.decimar(entrada)], [1, 5, 9, 13]);
});

test('reaproveita o mesmo buffer de saída (sem alocar por chamada)', () => {
  const decimador = criarDecimador(64, 4);
  const entrada = senoide({ frequencia: 100, amostras: 64 });
  assert.equal(decimador.decimar(entrada), decimador.decimar(entrada));
});

test('fator inválido falha alto, não silenciosamente', () => {
  assert.throws(() => criarDecimador(1024, 0));
  assert.throws(() => criarDecimador(1024, 2.5));
  assert.throws(() => criarDecimador(1024, -2));
});

test('a média de blocos não desloca a frequência do sinal', () => {
  // O que a decimação não pode fazer é mudar a nota. Um período de 100 Hz
  // decimado por 4 continua sendo 100 Hz na taxa nova.
  const fator = 4;
  const frequencia = 100;
  const amostras = 4096;
  const decimador = criarDecimador(amostras, fator);
  const saida = decimador.decimar(senoide({ frequencia, amostras, fase: 0 }));

  // Mede o período pelos cruzamentos de zero ascendentes, com interpolação
  // linear em cada um. Contar cruzamentos inteiros quantizaria a estimativa em
  // ~6 Hz nesta janela — grosso demais para afirmar qualquer coisa.
  const taxaNova = SAMPLE_RATE / fator;
  const cruzamentos = [];
  for (let i = 1; i < saida.length; i += 1) {
    if (saida[i - 1] <= 0 && saida[i] > 0) {
      const fracao = -saida[i - 1] / (saida[i] - saida[i - 1]);
      cruzamentos.push(i - 1 + fracao);
    }
  }

  assert.ok(cruzamentos.length >= 3, 'sinal curto demais para estimar o período');

  const periodoEmAmostras =
    (cruzamentos[cruzamentos.length - 1] - cruzamentos[0]) / (cruzamentos.length - 1);
  const frequenciaEstimada = taxaNova / periodoEmAmostras;
  const erroEmCents = 1200 * Math.log2(frequenciaEstimada / frequencia);

  assert.ok(
    Math.abs(erroEmCents) < 1,
    `frequência mudou: ${frequenciaEstimada.toFixed(3)} Hz em vez de ${frequencia} Hz ` +
      `(${erroEmCents.toFixed(2)} cents)`,
  );
});

test('a porta de silêncio bate com os níveis medidos em campo (D19)', () => {
  // Números reais, medidos por Yuri em celular Android e desktop, 48 kHz:
  //   repouso  −75 dBFS   |   tocando  −20 a −11 dBFS (pico, varia por corda)
  // A porta precisa deixar o ruído de fora e o sinal passar, com folga nos dois
  // lados — senão ou o afinador lê a sala, ou perde a nota no meio do decaimento.
  const PISO_MEDIDO = -75;
  const PICO_MAIS_FRACO = -20;

  assert.ok(
    LIMIAR_SILENCIO_DBFS - PISO_MEDIDO >= 15,
    `limiar ${LIMIAR_SILENCIO_DBFS} dBFS fica a só ${LIMIAR_SILENCIO_DBFS - PISO_MEDIDO} dB ` +
      'do piso de ruído — a sala entraria como sinal',
  );

  assert.ok(
    PICO_MAIS_FRACO - LIMIAR_SILENCIO_DBFS >= 30,
    `a corda mais fraca fica a só ${PICO_MAIS_FRACO - LIMIAR_SILENCIO_DBFS} dB do limiar — ` +
      'a nota seria cortada no início do decaimento',
  );
});

test('temSinal aceita nota tocada e rejeita silêncio', () => {
  const amostras = 2048;

  // −12 dBFS: um pico típico medido em campo.
  assert.equal(temSinal(senoide({ frequencia: 110, amostras, amplitude: 0.35 })), true);

  // Silêncio absoluto e ruído bem abaixo do piso.
  assert.equal(temSinal(new Float32Array(amostras)), false);
  assert.equal(temSinal(senoide({ frequencia: 110, amostras, amplitude: 0.0005 })), false);
});

test('nivelDbfs distingue silêncio, sinal fraco e sinal forte (FR-4)', () => {
  assert.equal(nivelDbfs(new Float32Array(1024)), -Infinity);

  const forte = nivelDbfs(senoide({ frequencia: 110, amostras: 1024, amplitude: 0.5 }));
  const fraco = nivelDbfs(senoide({ frequencia: 110, amostras: 1024, amplitude: 0.001 }));

  assert.ok(forte > -20, `sinal forte deu ${forte.toFixed(1)} dBFS`);
  assert.ok(fraco < -50, `sinal fraco deu ${fraco.toFixed(1)} dBFS — a porta não o barraria`);
});
