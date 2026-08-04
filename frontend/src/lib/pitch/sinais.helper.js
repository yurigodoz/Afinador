/**
 * Geradores de sinal sintético para os testes.
 *
 * Não é arquivo de teste (o nome não casa com os padrões do `node --test`) —
 * é o material que os testes usam para exercitar o detector sem microfone.
 */

import { fatorDeDecimacao, tamanhoDeJanela } from '../instrumentos.js';
import { criarDecimador } from './decimate.js';
import { criarDetector } from './yin.js';

export const SAMPLE_RATE = 48000;

/**
 * Senoide pura.
 * A fase aleatória por padrão é de propósito: o detector não pode depender de o
 * sinal começar num ponto específico do ciclo.
 */
export function senoide({ frequencia, amostras, sampleRate = SAMPLE_RATE, amplitude = 0.5, fase = Math.random() * Math.PI * 2 }) {
  const buffer = new Float32Array(amostras);
  const w = (2 * Math.PI * frequencia) / sampleRate;
  for (let i = 0; i < amostras; i += 1) {
    buffer[i] = amplitude * Math.sin(w * i + fase);
  }
  return buffer;
}

/**
 * Tom com parciais harmônicas.
 *
 * `pesos[0]` é a fundamental, `pesos[1]` a 2ª parcial e assim por diante. Um
 * peso baixo na fundamental reproduz o timbre de baixo (e de corda grave de
 * violão), que é justamente onde a autocorrelação ingênua erra a oitava.
 */
export function tomHarmonico({
  frequencia,
  amostras,
  sampleRate = SAMPLE_RATE,
  pesos = [1, 0.5, 0.25],
  amplitude = 0.5,
}) {
  const buffer = new Float32Array(amostras);
  const soma = pesos.reduce((a, b) => a + b, 0);

  for (let p = 0; p < pesos.length; p += 1) {
    if (pesos[p] === 0) continue;
    const w = (2 * Math.PI * frequencia * (p + 1)) / sampleRate;
    const fase = Math.random() * Math.PI * 2;
    const ganho = (amplitude * pesos[p]) / soma;
    for (let i = 0; i < amostras; i += 1) {
      buffer[i] += ganho * Math.sin(w * i + fase);
    }
  }
  return buffer;
}

/** Ruído branco uniforme. */
export function ruidoBranco({ amostras, amplitude = 0.2 }) {
  const buffer = new Float32Array(amostras);
  for (let i = 0; i < amostras; i += 1) {
    buffer[i] = amplitude * (Math.random() * 2 - 1);
  }
  return buffer;
}

/** Soma dois sinais do mesmo tamanho, em um novo buffer. */
export function somar(a, b) {
  const saida = new Float32Array(a.length);
  for (let i = 0; i < a.length; i += 1) saida[i] = a[i] + b[i];
  return saida;
}

/**
 * Monta o par decimador + detector de um perfil, exatamente como o laço de
 * análise fará em produção (design.md §4).
 */
export function montarPipeline(perfil, sampleRate = SAMPLE_RATE) {
  const tamanhoJanela = tamanhoDeJanela(perfil, sampleRate);
  const fator = fatorDeDecimacao(perfil, sampleRate);

  const decimador = criarDecimador(tamanhoJanela, fator);
  const detector = criarDetector({
    tamanho: decimador.tamanhoSaida,
    sampleRate: sampleRate / fator,
    fmin: perfil.fmin,
    fmax: perfil.fmax,
  });

  return {
    tamanhoJanela,
    fator,
    decimador,
    detector,
    /** @returns {{frequencia:number, clarity:number}|null} */
    analisar(buffer) {
      return detector.detectar(decimador.decimar(buffer));
    },
  };
}

/** Erro em cents entre o detectado e o esperado. */
export function erroEmCents(detectado, esperado) {
  return 1200 * Math.log2(detectado / esperado);
}
