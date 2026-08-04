/**
 * Suavização, retenção e histerese (design.md §5).
 *
 * Estimativas cruas a 30 Hz tremem, e um mostrador que treme é um mostrador em
 * que não se confia. São três peças independentes, propositalmente separadas
 * para poderem ser testadas isoladas:
 *
 *   1. `criarFiltroFrequencia` — mediana móvel + retenção ao perder o sinal
 *   2. `criarSuavizadorCents`  — exponencial sobre cents, com reset ao trocar de alvo
 *   3. `criarConfirmadorAfinado` — tempo mínimo dentro da tolerância + banda morta
 *
 * Módulo puro (design.md §7).
 */

/**
 * Mediana móvel sobre as frequências recentes, com retenção do último valor.
 *
 * A mediana (e não a média) é o que mata *outlier* isolado: um único frame com
 * erro de oitava fica descartado em vez de arrastar o ponteiro pela metade do
 * caminho. Cinco amostras a 30 Hz custam ~165 ms de memória — curto o bastante
 * para não atrasar a resposta percebida.
 */
export function criarFiltroFrequencia({ tamanho = 5, retencaoMs = 400 } = {}) {
  const janela = new Float64Array(tamanho);
  const ordenacao = new Float64Array(tamanho);
  let preenchidos = 0;
  let proximo = 0;
  let ultimoValor = null;
  let ultimoValidoMs = -Infinity;

  return {
    /**
     * @param {number|null} frequencia leitura crua do detector, ou null
     * @param {number} agoraMs
     * @returns {number|null} frequência estável, ou null quando o sinal expirou
     */
    processar(frequencia, agoraMs) {
      if (frequencia === null || !Number.isFinite(frequencia)) {
        // Retenção: entre dedilhadas o sinal some por alguns frames. Apagar o
        // mostrador nessa hora faria a tela piscar a cada nota (FR-4).
        if (ultimoValor !== null && agoraMs - ultimoValidoMs < retencaoMs) {
          return ultimoValor;
        }
        this.reiniciar();
        return null;
      }

      janela[proximo] = frequencia;
      proximo = (proximo + 1) % tamanho;
      if (preenchidos < tamanho) preenchidos += 1;

      // Insertion sort sobre no máximo 5 elementos, sem alocar.
      for (let i = 0; i < preenchidos; i += 1) {
        const valor = janela[i];
        let j = i - 1;
        while (j >= 0 && ordenacao[j] > valor) {
          ordenacao[j + 1] = ordenacao[j];
          j -= 1;
        }
        ordenacao[j + 1] = valor;
      }

      ultimoValor = ordenacao[preenchidos >> 1];
      ultimoValidoMs = agoraMs;
      return ultimoValor;
    },

    reiniciar() {
      preenchidos = 0;
      proximo = 0;
      ultimoValor = null;
      ultimoValidoMs = -Infinity;
    },
  };
}

/**
 * Suavização exponencial sobre o desvio em **cents**, não em Hz.
 *
 * Suavizar em Hz daria resposta desigual entre grave e agudo: 1 Hz vale 42 cents
 * no B0 e 5 cents no E4. Em cents a constante de tempo é a mesma na tessitura
 * inteira — que aqui vai de 30 Hz a 330 Hz, mais de três oitavas.
 *
 * Trocar de corda-alvo reinicia o estado: interpolar entre o desvio da corda
 * antiga e o da nova produziria um valor que nunca existiu.
 */
export function criarSuavizadorCents({ alfa = 0.25, saltoMaximoCents = 100 } = {}) {
  let valor = null;
  let alvoAtual = null;

  return {
    processar(cents, chaveAlvo) {
      if (cents === null || !Number.isFinite(cents)) {
        return valor;
      }
      if (chaveAlvo !== alvoAtual) {
        alvoAtual = chaveAlvo;
        valor = cents;
        return valor;
      }
      if (valor === null) {
        valor = cents;
        return valor;
      }

      // Salto grande dentro do mesmo alvo não é ruído a suavizar: ou é outra
      // nota, ou é a mesma corda depois de ser mexida. Interpolar entre os dois
      // exibiria, por meio segundo, desvios que nunca existiram — o ponteiro
      // varrendo a tela inteira até alcançar a realidade. Melhor assumir o valor
      // novo de uma vez.
      if (Math.abs(cents - valor) > saltoMaximoCents) {
        valor = cents;
        return valor;
      }

      valor += alfa * (cents - valor);
      return valor;
    },

    reiniciar() {
      valor = null;
      alvoAtual = null;
    },
  };
}

/**
 * Confirmação de corda afinada (FR-8).
 *
 * Duas proteções contra o estado piscar:
 *
 * - **Tempo mínimo:** exige `confirmacaoMs` contínuos dentro da tolerância. Uma
 *   passagem rápida pelo alvo enquanto se gira a tarraxa não conta como afinado.
 * - **Banda morta:** uma vez afinada, a corda só perde o selo acima de
 *   `toleranciaSaida`. Sem isso, oscilar em torno de ±5 acenderia e apagaria o
 *   indicador várias vezes por segundo.
 */
export function criarConfirmadorAfinado({
  confirmacaoMs = 700,
  toleranciaAfinado = 5,
  toleranciaSaida = 10,
} = {}) {
  let dentroDesdeMs = null;
  let afinado = false;
  let alvoAtual = null;

  return {
    /**
     * @returns {boolean} se a corda-alvo está confirmada como afinada
     */
    processar(cents, chaveAlvo, agoraMs) {
      if (chaveAlvo !== alvoAtual) {
        alvoAtual = chaveAlvo;
        dentroDesdeMs = null;
        afinado = false;
      }

      if (cents === null || !Number.isFinite(cents)) {
        dentroDesdeMs = null;
        return afinado;
      }

      const desvio = Math.abs(cents);

      if (afinado) {
        if (desvio > toleranciaSaida) {
          afinado = false;
          dentroDesdeMs = null;
        }
        return afinado;
      }

      if (desvio <= toleranciaAfinado) {
        if (dentroDesdeMs === null) dentroDesdeMs = agoraMs;
        if (agoraMs - dentroDesdeMs >= confirmacaoMs) afinado = true;
      } else {
        dentroDesdeMs = null;
      }

      return afinado;
    },

    reiniciar() {
      dentroDesdeMs = null;
      afinado = false;
      alvoAtual = null;
    },
  };
}
