/**
 * Decimação por fator inteiro.
 *
 * Não é otimização opcional — é parte do desenho (decisions.md D11). O custo do
 * YIN é (τmax − τmin) × N; sem decimar, o perfil de baixo custaria 13,2 M
 * operações por frame a 30 Hz. Com decimação os dois perfis ficam abaixo de 1 M.
 *
 * Segurança de Nyquist: o lowpass do grafo já limitou a banda antes daqui
 * (1 kHz no violão → 24 kHz de taxa, limite 12 kHz; 500 Hz no baixo → 12 kHz de
 * taxa, limite 6 kHz). Sobra mais de uma oitava de folga nos dois casos, então
 * não há aliasing e não é preciso filtro anti-alias adicional.
 *
 * A precisão não se perde com a taxa menor: ela vem da interpolação parabólica
 * do YIN, não do número de amostras por período.
 *
 * Módulo puro (design.md §7).
 */

/**
 * Cria um decimador com buffer de saída pré-alocado.
 *
 * Chamar `decimar` não aloca nada — devolve sempre a mesma view, que o chamador
 * deve consumir antes da próxima chamada (NFR-3).
 *
 * @param {number} tamanhoEntrada  amostras por janela antes da decimação
 * @param {number} fator           fator inteiro ≥ 1
 */
export function criarDecimador(tamanhoEntrada, fator) {
  if (!Number.isInteger(fator) || fator < 1) {
    throw new Error(`Fator de decimação inválido: ${fator}`);
  }

  const tamanhoSaida = Math.floor(tamanhoEntrada / fator);
  const saida = new Float32Array(tamanhoSaida);

  return {
    tamanhoSaida,
    fator,

    /**
     * Reduz a taxa por média de blocos de `fator` amostras.
     *
     * A média (e não a simples escolha de 1 em cada `fator`) atua como um
     * passa-baixa extra de ordem baixa — barato e útil como rede de segurança
     * se o lowpass do grafo estiver mais aberto do que o previsto.
     */
    decimar(entrada) {
      if (fator === 1) {
        saida.set(entrada.subarray(0, tamanhoSaida));
        return saida;
      }

      for (let i = 0; i < tamanhoSaida; i += 1) {
        const inicio = i * fator;
        let soma = 0;
        for (let j = 0; j < fator; j += 1) soma += entrada[inicio + j];
        saida[i] = soma / fator;
      }

      return saida;
    },
  };
}

/** RMS do buffer, em dBFS. Alimenta a porta de silêncio (FR-4). */
export function nivelDbfs(buffer) {
  let soma = 0;
  for (let i = 0; i < buffer.length; i += 1) soma += buffer[i] * buffer[i];
  const rms = Math.sqrt(soma / buffer.length);
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

/**
 * Limiar da porta de silêncio (FR-4), em dBFS.
 *
 * Referência das medições em campo (decisions.md D19):
 *
 * - Piso de ruído do celular em repouso: **−75 dBFS**
 * - Pico ao tocar as cordas: **−20 a −11 dBFS**, variando por corda
 *
 * A −50 dBFS ficam 25 dB de margem sobre o ruído de fundo e 30 dB de decaimento
 * tolerado na corda mais fraca.
 *
 * **Este valor já foi −55 e voltou para −50** (decisions.md D23). A mudança para
 * −55 tinha sido feita para acompanhar a nota por mais tempo no decaimento — um
 * problema previsto, nunca observado. O valor de −50 é o que estava em uso
 * quando o afinador foi validado contra um afinador de referência. Trocar um
 * parâmetro validado por causa de uma previsão é como o projeto ganhou uma
 * variável a mais para investigar quando um sintoma real apareceu.
 *
 * Se o corte durante o decaimento aparecer de verdade, a análise que motivou os
 * −55 continua em D19 e pode ser retomada — agora com sintoma para validar.
 */
export const LIMIAR_SILENCIO_DBFS = -50;

/** @returns {boolean} se o buffer tem sinal suficiente para valer a análise. */
export function temSinal(buffer, limiarDbfs = LIMIAR_SILENCIO_DBFS) {
  return nivelDbfs(buffer) >= limiarDbfs;
}
