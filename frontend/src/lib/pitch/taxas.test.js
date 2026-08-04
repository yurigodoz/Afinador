/**
 * Os perfis precisam funcionar na taxa que o dispositivo entregar.
 *
 * `AudioContext.sampleRate` não é escolha nossa — o navegador devolve o que o
 * hardware usa. 48 kHz é comum em desktop, 44,1 kHz aparece bastante em celular,
 * e interface de áudio externa costuma subir para 96 kHz. Se um perfil não
 * servir naquela taxa, o afinador quebra só naquele aparelho, e o relato chega
 * como "não funciona no meu celular" — o pior tipo de bug para diagnosticar à
 * distância.
 *
 * Foi este arquivo que pegou a janela fixa em amostras: a 96 kHz o violão caía
 * para 2,8 períodos da nota mais grave. Daí `duracaoJanelaMs` e `taxaAlvoHz`
 * substituírem os antigos `tamanhoJanela` e `decimacao` constantes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INSTRUMENTOS,
  fatorDeDecimacao,
  midiParaFreq,
  tamanhoDeJanela,
} from '../instrumentos.js';
import { criarDecimador } from './decimate.js';
import { criarDetector } from './yin.js';
import { erroEmCents, montarPipeline, tomHarmonico } from './sinais.helper.js';

/** Taxas que aparecem em hardware real. */
const TAXAS = [44100, 48000, 96000];

/** Menor MIDI usado por qualquer preset do instrumento. */
function midiMaisGrave(instrumento) {
  return Math.min(...instrumento.afinacoes.flatMap((a) => a.cordas));
}

test('todo perfil monta detector válido nas taxas usuais', () => {
  for (const { id, perfil } of INSTRUMENTOS) {
    for (const taxa of TAXAS) {
      const decimador = criarDecimador(
        tamanhoDeJanela(perfil, taxa),
        fatorDeDecimacao(perfil, taxa),
      );

      assert.doesNotThrow(
        () =>
          criarDetector({
            tamanho: decimador.tamanhoSaida,
            sampleRate: taxa / fatorDeDecimacao(perfil, taxa),
            fmin: perfil.fmin,
            fmax: perfil.fmax,
          }),
        `${id} não monta a ${taxa} Hz`,
      );
    }
  }
});

test('a janela cobre ao menos 4 períodos da nota mais grave em qualquer taxa', () => {
  for (const { id, perfil } of INSTRUMENTOS) {
    for (const taxa of TAXAS) {
      const periodos = tamanhoDeJanela(perfil, taxa) / (taxa / perfil.fmin);
      assert.ok(
        periodos >= 4,
        `${id} a ${taxa} Hz: só ${periodos.toFixed(1)} períodos de ${perfil.fmin} Hz`,
      );
    }
  }
});

test('a 48 kHz os perfis dão os valores históricos da spec', () => {
  const violao = INSTRUMENTOS.find((i) => i.id === 'violao').perfil;
  const baixo = INSTRUMENTOS.find((i) => i.id === 'baixo-5').perfil;

  assert.equal(tamanhoDeJanela(violao, 48000), 4096, 'violão a 48 kHz deve dar 4096 (design.md §3)');
  assert.equal(tamanhoDeJanela(baixo, 48000), 8192, 'baixo a 48 kHz deve dar 8192 (D4)');
  assert.equal(fatorDeDecimacao(violao, 48000), 2);
  assert.equal(fatorDeDecimacao(baixo, 48000), 4);
});

test('o custo por frame fica estável entre taxas (D11)', () => {
  // Sem derivar a decimação da taxa, um aparelho de 96 kHz custaria 4× o de
  // 48 kHz — e travaria justamente no celular mais fraco.
  for (const { id, perfil } of INSTRUMENTOS) {
    const custos = TAXAS.map((taxa) => {
      const fator = fatorDeDecimacao(perfil, taxa);
      const n = tamanhoDeJanela(perfil, taxa) / fator;
      const taxaTrabalho = taxa / fator;
      const tauMax = Math.ceil(taxaTrabalho / perfil.fmin);
      return (n - tauMax) * tauMax;
    });

    const menor = Math.min(...custos);
    const maior = Math.max(...custos);
    assert.ok(
      maior / menor < 1.6,
      `${id}: custo varia ${(maior / menor).toFixed(2)}× entre taxas ` +
        `(${custos.map((c) => (c / 1e6).toFixed(2)).join(' / ')} M operações)`,
    );
  }
});

test('precisão se mantém em todas as taxas, na corda mais grave', () => {
  for (const instrumento of INSTRUMENTOS) {
    for (const taxa of TAXAS) {
      const pipeline = montarPipeline(instrumento.perfil, taxa);
      const esperado = midiParaFreq(midiMaisGrave(instrumento));

      const sinal = tomHarmonico({
        frequencia: esperado,
        amostras: pipeline.tamanhoJanela,
        sampleRate: taxa,
        pesos: [0.4, 1, 0.6],
      });

      const leitura = pipeline.analisar(sinal);
      assert.ok(leitura !== null, `${instrumento.id}: nada detectado a ${taxa} Hz`);

      const erro = erroEmCents(leitura.frequencia, esperado);
      assert.ok(
        Math.abs(erro) <= 1,
        `${instrumento.id} a ${taxa} Hz: ${esperado.toFixed(2)} Hz errou ${erro.toFixed(3)} cents`,
      );
    }
  }
});

test('taxa baixa demais para a faixa de busca é recusada, não improvisada', () => {
  // Escrevi este teste esperando que uma taxa muito baixa quebrasse a janela.
  // Não quebra: a 800 Hz a janela de 170 ms ainda cobre ~10 períodos do B0.
  // O que de fato quebra é a faixa de busca: `fmax` = 450 Hz fica acima do
  // Nyquist de 400 Hz, e o que houvesse ali seria aliasing — nota que ninguém
  // tocou, reportada com confiança. Por isso o detector recusa a construção.
  const perfil = INSTRUMENTOS.find((i) => i.id === 'baixo-5').perfil;
  const taxa = 800;

  assert.throws(
    () => {
      const decimador = criarDecimador(
        tamanhoDeJanela(perfil, taxa),
        fatorDeDecimacao(perfil, taxa),
      );
      criarDetector({
        tamanho: decimador.tamanhoSaida,
        sampleRate: taxa / fatorDeDecimacao(perfil, taxa),
        fmin: perfil.fmin,
        fmax: perfil.fmax,
      });
    },
    /acima de Nyquist/,
  );
});

test('a faixa de busca fica com folga larga sob Nyquist nas taxas reais', () => {
  for (const { id, perfil } of INSTRUMENTOS) {
    for (const taxa of TAXAS) {
      const taxaTrabalho = taxa / fatorDeDecimacao(perfil, taxa);
      const folga = taxaTrabalho / 2 / perfil.fmax;
      assert.ok(
        folga >= 4,
        `${id} a ${taxa} Hz: fmax=${perfil.fmax} Hz contra Nyquist de ` +
          `${taxaTrabalho / 2} Hz — folga de apenas ${folga.toFixed(1)}×`,
      );
    }
  }
});
