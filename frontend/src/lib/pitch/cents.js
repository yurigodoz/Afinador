/**
 * Conversões de frequência para cents e escolha da corda-alvo.
 *
 * Módulo puro (design.md §7).
 */

// Import relativo, não pelo alias `@/`: estes módulos precisam rodar direto no
// Node (`node --test`), que não conhece os `paths` do jsconfig. O alias fica
// para os componentes, que sempre passam pelo bundler do Next.
import { A4_PADRAO, freqParaMidi, nomeDaNota } from '../instrumentos.js';

/** Tolerância para considerar a corda afinada (FR-8). */
export const TOLERANCIA_AFINADO = 5;

/** Banda morta: só perde o selo de afinada acima disso (design.md §5). */
export const TOLERANCIA_SAIDA = 10;

/** Acima de um semitom de distância, a nota não é de nenhuma corda (FR-6). */
export const LIMITE_FORA_DA_AFINACAO = 100;

/**
 * Desvio em cents de `freq` em relação a `alvo`.
 * Negativo = abaixo do alvo (apertar); positivo = acima (afrouxar).
 */
export function cents(freq, alvo) {
  return 1200 * Math.log2(freq / alvo);
}

/**
 * Corda cujo alvo está mais próximo da frequência detectada (FR-5).
 *
 * Compara sempre por frequência absoluta, então oitavas do mesmo nome — D2/D3/D4
 * no DADGAD, ou o D2 que o violão e o baixo compartilham — nunca colidem.
 *
 * `foraDaAfinacao` avisa que a distância passou de um semitom; nesse caso o
 * chamador deve mostrar a nota cromática em vez de forçar a corda (FR-6).
 */
export function cordaMaisProxima(freq, cordas) {
  if (!Number.isFinite(freq) || freq <= 0 || !cordas || cordas.length === 0) {
    return null;
  }

  let melhor = null;
  let melhorDesvio = Infinity;

  for (const corda of cordas) {
    const desvio = cents(freq, corda.frequencia);
    if (Math.abs(desvio) < Math.abs(melhorDesvio)) {
      melhor = corda;
      melhorDesvio = desvio;
    }
  }

  return {
    corda: melhor,
    cents: melhorDesvio,
    foraDaAfinacao: Math.abs(melhorDesvio) > LIMITE_FORA_DA_AFINACAO,
  };
}

/**
 * Nota cromática mais próxima, independente de afinação (FR-6).
 * Usa sustenidos: fora do contexto de um preset não há grafia "certa".
 */
export function notaCromatica(freq, a4 = A4_PADRAO) {
  if (!Number.isFinite(freq) || freq <= 0) return null;

  const midiExato = freqParaMidi(freq, a4);
  const midi = Math.round(midiExato);

  return {
    midi,
    nome: nomeDaNota(midi),
    cents: (midiExato - midi) * 100,
  };
}

/** Rótulo direcional exibido junto do número (FR-7, NFR-6). */
export function direcao(desvioEmCents) {
  if (Math.abs(desvioEmCents) <= TOLERANCIA_AFINADO) return 'afinado';
  return desvioEmCents < 0 ? 'aperte' : 'afrouxe';
}
