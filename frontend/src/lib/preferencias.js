/**
 * Validação e normalização das preferências do usuário (FR-0, FR-11, FR-12).
 *
 * Módulo puro — não toca `localStorage`. Quem persiste é o hook; aqui só se
 * decide o que é preferência válida.
 *
 * A separação importa porque o conteúdo do armazenamento é entrada não confiável:
 * pode vir de uma versão anterior do app, de um preset que deixou de existir ou
 * de alguém que editou à mão. Cair num estado inválido travaria a tela num
 * instrumento inexistente, sem caminho de volta.
 */

import {
  A4_MAX,
  A4_MIN,
  A4_PADRAO,
  INSTRUMENTOS,
  INSTRUMENTO_PADRAO,
  buscarAfinacao,
  buscarInstrumento,
} from './instrumentos.js';

export const CHAVE_ARMAZENAMENTO = 'afinador:preferencias';

export const PREFERENCIAS_PADRAO = Object.freeze({
  instrumentoId: INSTRUMENTO_PADRAO,
  afinacaoId: 'padrao',
  a4: A4_PADRAO,
});

/**
 * Devolve preferências sempre utilizáveis, corrigindo o que estiver inválido.
 *
 * Nunca lança e nunca devolve um estado impossível: qualquer campo estranho cai
 * no padrão, campo por campo. Um instrumento inválido não deve derrubar junto um
 * diapasão que estava perfeitamente bom.
 */
export function normalizarPreferencias(bruto) {
  if (!bruto || typeof bruto !== 'object') return { ...PREFERENCIAS_PADRAO };

  const instrumentoId = buscarInstrumento(bruto.instrumentoId)
    ? bruto.instrumentoId
    : PREFERENCIAS_PADRAO.instrumentoId;

  // A afinação é validada **contra o instrumento já resolvido**: 'drop-d' existe
  // no violão e no baixo de 4, mas não no de 5.
  const afinacaoId = buscarAfinacao(instrumentoId, bruto.afinacaoId)
    ? bruto.afinacaoId
    : primeiraAfinacaoDe(instrumentoId);

  const a4 =
    typeof bruto.a4 === 'number' && Number.isFinite(bruto.a4)
      ? Math.min(A4_MAX, Math.max(A4_MIN, Math.round(bruto.a4)))
      : PREFERENCIAS_PADRAO.a4;

  return { instrumentoId, afinacaoId, a4 };
}

/** Primeira afinação listada de um instrumento — o destino seguro ao trocar. */
export function primeiraAfinacaoDe(instrumentoId) {
  const instrumento = buscarInstrumento(instrumentoId) ?? INSTRUMENTOS[0];
  return instrumento.afinacoes[0].id;
}

/**
 * Ao trocar de instrumento, mantém a afinação equivalente se ela existir lá.
 *
 * Quem estava em "meio tom abaixo" no violão e vai para o baixo espera continuar
 * em meio tom abaixo, não voltar para o padrão.
 */
export function afinacaoAoTrocarInstrumento(instrumentoId, afinacaoAtual) {
  return buscarAfinacao(instrumentoId, afinacaoAtual)
    ? afinacaoAtual
    : primeiraAfinacaoDe(instrumentoId);
}
