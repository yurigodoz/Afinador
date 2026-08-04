/**
 * Testes do detector de altura — o critério numérico da Task 2.
 *
 * Este arquivo é o que decide se o resto do projeto tem chance: se o YIN não
 * bater 1 cent aqui, nenhuma interface conserta isso depois.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INSTRUMENTOS,
  PERFIL_BAIXO,
  PERFIL_VIOLAO,
  midiParaFreq,
  nomeDaNota,
  tamanhoDeJanela,
} from '../instrumentos.js';
import {
  SAMPLE_RATE,
  erroEmCents,
  montarPipeline,
  ruidoBranco,
  senoide,
  somar,
  tomHarmonico,
} from './sinais.helper.js';

/** Fixa a semente do acaso não é possível em JS puro; repetir compensa. */
const REPETICOES = 5;

test('senoide pura em toda frequência-alvo dos presets: erro ≤ 1 cent (NFR-1)', () => {
  for (const instrumento of INSTRUMENTOS) {
    const { perfil } = instrumento;
    const pipeline = montarPipeline(perfil);

    const midis = new Set();
    for (const afinacao of instrumento.afinacoes) {
      for (const midi of afinacao.cordas) midis.add(midi);
    }

    for (const midi of midis) {
      const esperado = midiParaFreq(midi);

      for (let r = 0; r < REPETICOES; r += 1) {
        const sinal = senoide({ frequencia: esperado, amostras: tamanhoDeJanela(perfil, SAMPLE_RATE) });
        const leitura = pipeline.analisar(sinal);

        assert.ok(
          leitura !== null,
          `${instrumento.id}: não detectou ${nomeDaNota(midi)} (${esperado.toFixed(2)} Hz)`,
        );

        const erro = erroEmCents(leitura.frequencia, esperado);
        assert.ok(
          Math.abs(erro) <= 1,
          `${instrumento.id}: ${nomeDaNota(midi)} (${esperado.toFixed(2)} Hz) errou ${erro.toFixed(3)} cents`,
        );
      }
    }
  }
});

test('timbre de baixo (fundamental fraca) não produz erro de oitava', () => {
  const pipeline = montarPipeline(PERFIL_BAIXO);

  // E1 = 41,20 Hz com a fundamental bem mais fraca que as parciais — o caso que
  // faz a autocorrelação ingênua responder 82,4 Hz (a 2ª parcial).
  const esperado = midiParaFreq(28);

  for (let r = 0; r < REPETICOES; r += 1) {
    const sinal = tomHarmonico({
      frequencia: esperado,
      amostras: tamanhoDeJanela(PERFIL_BAIXO, SAMPLE_RATE),
      pesos: [0.2, 1, 0.8, 0.4],
    });
    const leitura = pipeline.analisar(sinal);

    assert.ok(leitura !== null, 'não detectou o E1 de fundamental fraca');
    const erro = erroEmCents(leitura.frequencia, esperado);
    assert.ok(
      Math.abs(erro) <= 1,
      `E1 com fundamental fraca errou ${erro.toFixed(3)} cents ` +
        `(detectou ${leitura.frequencia.toFixed(2)} Hz, esperado ${esperado.toFixed(2)} Hz)`,
    );
  }
});

test('E2 do violão com harmônicos: sem erro de oitava para cima nem para baixo', () => {
  const pipeline = montarPipeline(PERFIL_VIOLAO);
  const esperado = midiParaFreq(40); // E2 = 82,41 Hz

  for (let r = 0; r < REPETICOES; r += 1) {
    const sinal = tomHarmonico({
      frequencia: esperado,
      amostras: tamanhoDeJanela(PERFIL_VIOLAO, SAMPLE_RATE),
      pesos: [1, 0.7, 0.5, 0.3, 0.2],
    });
    const leitura = pipeline.analisar(sinal);

    assert.ok(leitura !== null, 'não detectou o E2');
    const erro = erroEmCents(leitura.frequencia, esperado);
    assert.ok(Math.abs(erro) <= 1, `E2 errou ${erro.toFixed(3)} cents`);
  }
});

test('B0 do baixo de 5 cordas (30,87 Hz): erro ≤ 1 cent', () => {
  const pipeline = montarPipeline(PERFIL_BAIXO);
  const esperado = midiParaFreq(23);

  for (let r = 0; r < REPETICOES; r += 1) {
    const sinal = tomHarmonico({
      frequencia: esperado,
      amostras: tamanhoDeJanela(PERFIL_BAIXO, SAMPLE_RATE),
      pesos: [0.5, 1, 0.6],
    });
    const leitura = pipeline.analisar(sinal);

    assert.ok(leitura !== null, 'não detectou o B0');
    const erro = erroEmCents(leitura.frequencia, esperado);
    assert.ok(
      Math.abs(erro) <= 1,
      `B0 errou ${erro.toFixed(3)} cents (detectou ${leitura.frequencia.toFixed(3)} Hz)`,
    );
  }
});

test('tom com ruído somado ainda fica dentro de 3 cents', () => {
  const pipeline = montarPipeline(PERFIL_VIOLAO);
  const esperado = midiParaFreq(50); // D3 = 146,83 Hz

  for (let r = 0; r < REPETICOES; r += 1) {
    const limpo = tomHarmonico({
      frequencia: esperado,
      amostras: tamanhoDeJanela(PERFIL_VIOLAO, SAMPLE_RATE),
      pesos: [1, 0.5, 0.3],
    });
    const sujo = somar(limpo, ruidoBranco({ amostras: tamanhoDeJanela(PERFIL_VIOLAO, SAMPLE_RATE), amplitude: 0.03 }));
    const leitura = pipeline.analisar(sujo);

    assert.ok(leitura !== null, 'não detectou o D3 com ruído');
    const erro = erroEmCents(leitura.frequencia, esperado);
    assert.ok(Math.abs(erro) <= 3, `D3 com ruído errou ${erro.toFixed(3)} cents`);
  }
});

test('ruído branco puro: retorna null ou clarity baixa (alimenta FR-4)', () => {
  const pipeline = montarPipeline(PERFIL_VIOLAO);

  let rejeitados = 0;
  const tentativas = 20;

  for (let r = 0; r < tentativas; r += 1) {
    const leitura = pipeline.analisar(ruidoBranco({ amostras: tamanhoDeJanela(PERFIL_VIOLAO, SAMPLE_RATE) }));
    if (leitura === null || leitura.clarity < 0.9) rejeitados += 1;
  }

  assert.equal(
    rejeitados,
    tentativas,
    'ruído branco passou como altura confiável em pelo menos uma tentativa',
  );
});

test('silêncio absoluto retorna null', () => {
  const pipeline = montarPipeline(PERFIL_VIOLAO);
  const leitura = pipeline.analisar(new Float32Array(tamanhoDeJanela(PERFIL_VIOLAO, SAMPLE_RATE)));
  assert.equal(leitura, null);
});

test('clarity é alta para tom limpo e menor para tom com ruído', () => {
  const pipeline = montarPipeline(PERFIL_VIOLAO);
  const freq = midiParaFreq(45); // A2 = 110 Hz

  const limpo = pipeline.analisar(senoide({ frequencia: freq, amostras: tamanhoDeJanela(PERFIL_VIOLAO, SAMPLE_RATE) }));
  const clarityLimpo = limpo.clarity;

  const sujo = pipeline.analisar(
    somar(
      senoide({ frequencia: freq, amostras: tamanhoDeJanela(PERFIL_VIOLAO, SAMPLE_RATE) }),
      ruidoBranco({ amostras: tamanhoDeJanela(PERFIL_VIOLAO, SAMPLE_RATE), amplitude: 0.15 }),
    ),
  );

  assert.ok(clarityLimpo > 0.9, `clarity do tom limpo foi ${clarityLimpo.toFixed(3)}`);
  assert.ok(
    sujo === null || sujo.clarity < clarityLimpo,
    'clarity não caiu com ruído somado',
  );
});

test('não aloca por chamada (NFR-3)', () => {
  const pipeline = montarPipeline(PERFIL_BAIXO);
  const sinal = tomHarmonico({ frequencia: midiParaFreq(28), amostras: tamanhoDeJanela(PERFIL_BAIXO, SAMPLE_RATE) });

  const CHAMADAS = 10000;

  // O limiar é generoso de propósito. Sem `--expose-gc` não dá para forçar
  // coleta, e o heap oscila por conta do próprio runtime — um limite apertado
  // reprovaria código correto. O que este teste precisa pegar é alocação *real*
  // no laço: um Float32Array de 2048 por chamada daria ~80 MB em 10 mil
  // chamadas, três ordens de grandeza acima do limite abaixo. Ruído de heap não
  // chega perto disso.
  const LIMITE_KB = 2048;

  for (let i = 0; i < 200; i += 1) pipeline.analisar(sinal);
  if (typeof global.gc === 'function') global.gc();

  const antes = process.memoryUsage().heapUsed;
  for (let i = 0; i < CHAMADAS; i += 1) pipeline.analisar(sinal);
  if (typeof global.gc === 'function') global.gc();
  const depois = process.memoryUsage().heapUsed;

  const crescimentoKb = (depois - antes) / 1024;
  assert.ok(
    crescimentoKb < LIMITE_KB,
    `heap cresceu ${crescimentoKb.toFixed(1)} KB em ${CHAMADAS} chamadas ` +
      `(${((crescimentoKb * 1024) / CHAMADAS).toFixed(1)} bytes/chamada) — há alocação no laço`,
  );
});

test('detecta o extremo agudo da faixa (E4) e o extremo grave (B0)', () => {
  const violao = montarPipeline(PERFIL_VIOLAO);
  const e4 = midiParaFreq(64);
  const leituraE4 = violao.analisar(senoide({ frequencia: e4, amostras: tamanhoDeJanela(PERFIL_VIOLAO, SAMPLE_RATE) }));
  assert.ok(leituraE4 !== null && Math.abs(erroEmCents(leituraE4.frequencia, e4)) <= 1);

  const baixo = montarPipeline(PERFIL_BAIXO);
  const b0 = midiParaFreq(23);
  const leituraB0 = baixo.analisar(senoide({ frequencia: b0, amostras: tamanhoDeJanela(PERFIL_BAIXO, SAMPLE_RATE) }));
  assert.ok(leituraB0 !== null && Math.abs(erroEmCents(leituraB0.frequencia, b0)) <= 1);
});

test('perfis têm janela suficiente para a corda mais grave do instrumento', () => {
  // Guarda contra alguém "otimizar" a janela do baixo de volta para 85 ms: com
  // 2,6 períodos do B0 o vale da função diferença deixa de ser confiável (D4).
  for (const perfil of [PERFIL_VIOLAO, PERFIL_BAIXO]) {
    const periodoDaMaisGrave = SAMPLE_RATE / perfil.fmin;
    const periodosNaJanela = tamanhoDeJanela(perfil, SAMPLE_RATE) / periodoDaMaisGrave;
    assert.ok(
      periodosNaJanela >= 4,
      `perfil ${perfil.id}: só ${periodosNaJanela.toFixed(1)} períodos de ${perfil.fmin} Hz na janela`,
    );
  }
});
