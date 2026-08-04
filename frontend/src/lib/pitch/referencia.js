/**
 * Regra da oitava no tom de referência (FR-13).
 *
 * Módulo puro. A decisão de qual frequência sai pelo alto-falante é regra de
 * produto, não detalhe de áudio — por isso mora aqui, testável em Node, e não
 * dentro do hook.
 */

/**
 * Abaixo desta frequência, alto-falante de celular não entrega a fundamental de
 * forma útil: o B0 do baixo (30,87 Hz) sairia inaudível ou como chiado, e o
 * usuário concluiria que o afinador está quebrado.
 */
export const LIMITE_OITAVA_ACIMA_HZ = 60;

/**
 * @param {number} alvoHz frequência da corda
 * @returns {{frequencia: number, oitavaAcima: boolean}} o que tocar de fato
 */
export function frequenciaAudivel(alvoHz) {
  if (alvoHz >= LIMITE_OITAVA_ACIMA_HZ) return { frequencia: alvoHz, oitavaAcima: false };
  // Uma oitava exata, não um valor arbitrário: fora disso o tom deixaria de
  // servir como referência de afinação.
  return { frequencia: alvoHz * 2, oitavaAcima: true };
}
