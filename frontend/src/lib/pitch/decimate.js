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
 * **Esta porta não existe para rejeitar ruído.** Ela poupa CPU: abaixo do limiar
 * não vale rodar decimação nem YIN. Quem rejeita ruído é o limiar absoluto do
 * próprio YIN — medido, ruído branco não produz leitura nenhuma em nível algum,
 * de −15 a −65 dBFS. Entender isso é o que permite abrir a porta com segurança.
 *
 * Medições em campo, e a diferença entre aparelhos é enorme (decisions.md D27):
 *
 * | | Android | iPhone |
 * |---|---|---|
 * | Silêncio | −75 dBFS | −80 dBFS |
 * | Pico ao tocar | −20 a −11 dBFS | **−40 dBFS** |
 *
 * O iPhone entrega o sinal 20 a 29 dB mais fraco. Com o limiar em −50 sobravam
 * 10 dB até o corte, e como uma nota perde 20 a 30 dB nos primeiros segundos, a
 * leitura sumia da tela quase imediatamente — e a corda mais aguda, a mais
 * fraca de todas, não era detectada de jeito nenhum.
 *
 * A −65 dBFS: **25 dB de decaimento tolerado** mesmo no pico fraco do iPhone, e
 * 15 dB de folga sobre o piso de ruído dele (10 dB sobre o do Android). A
 * detecção sintética se mantém boa até −70, então ainda há margem abaixo.
 *
 * Histórico: começou em −50, foi a −55 por previsão e voltou a −50 por falta de
 * sintoma (D19, D23). Agora desce a −65 **com sintoma medido em aparelho real**.
 */
export const LIMIAR_SILENCIO_DBFS = -65;

/** @returns {boolean} se o buffer tem sinal suficiente para valer a análise. */
export function temSinal(buffer, limiarDbfs = LIMIAR_SILENCIO_DBFS) {
  return nivelDbfs(buffer) >= limiarDbfs;
}
