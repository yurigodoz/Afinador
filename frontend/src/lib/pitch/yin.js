/**
 * Detecção de altura pelo algoritmo YIN (de Cheveigné & Kawahara, 2002).
 *
 * Por que não FFT (decisions.md D2): com janela de 4096 a 48 kHz a resolução
 * espectral é 11,7 Hz, enquanto 1 cent vale 0,048 Hz no E2 e 0,018 Hz no B0.
 * Chegar a essa resolução por FFT exigiria janelas de vários segundos. O YIN
 * mede o período em amostras e refina por interpolação parabólica, atingindo
 * sub-cent em dezenas de milissegundos.
 *
 * O passo que realmente importa aqui é a normalização cumulativa (§2 abaixo):
 * é ele que derruba o erro de oitava da autocorrelação pura — o problema
 * dominante no baixo, cujo timbre tem fundamental fraca e 2ª parcial forte.
 *
 * Módulo puro (design.md §7).
 */

/**
 * Limiar absoluto do YIN. Abaixo dele o vale é aceito como período.
 * 0,15 é o meio-termo usual: menor rejeita nota boa, maior aceita ruído.
 */
export const LIMIAR_PADRAO = 0.15;

/**
 * Cria um detector com todos os buffers pré-alocados.
 *
 * Chamar `detectar` não aloca nada (NFR-3) — nem o objeto de retorno, que é
 * reaproveitado entre chamadas. O chamador deve ler os campos antes da próxima
 * chamada, o que o laço de análise faz naturalmente.
 *
 * @param {object}  opcoes
 * @param {number}  opcoes.tamanho     amostras da janela **já decimada**
 * @param {number}  opcoes.sampleRate  taxa **já decimada** (Hz)
 * @param {number}  opcoes.fmin        menor frequência procurada (Hz)
 * @param {number}  opcoes.fmax        maior frequência procurada (Hz)
 * @param {number} [opcoes.limiar]     limiar absoluto (padrão 0,15)
 */
export function criarDetector({ tamanho, sampleRate, fmin, fmax, limiar = LIMIAR_PADRAO }) {
  // Procurar acima de Nyquist não é só inútil: o que existir ali é aliasing, e
  // o detector devolveria com confiança uma nota que não foi tocada. Falhar na
  // construção é melhor que mentir a cada frame.
  const nyquist = sampleRate / 2;
  if (fmax > nyquist) {
    throw new Error(
      `fmax (${fmax} Hz) acima de Nyquist (${nyquist} Hz) para a taxa de ${sampleRate} Hz`,
    );
  }

  const tauMax = Math.min(Math.ceil(sampleRate / fmin), tamanho - 1);
  const tauMin = Math.max(2, Math.floor(sampleRate / fmax));

  if (tauMin >= tauMax) {
    throw new Error(`Faixa de busca inválida: tauMin=${tauMin} tauMax=${tauMax}`);
  }

  // Quantas amostras entram em cada comparação. Usar o que sobra depois do
  // maior deslocamento aproveita a janela inteira, em vez do N/2 do artigo.
  const largura = tamanho - tauMax;
  if (largura < tauMax) {
    // Menos de 2 períodos da nota mais grave não sustentam um vale confiável.
    throw new Error(
      `Janela curta demais: ${tamanho} amostras para tauMax=${tauMax} (mínimo ~${tauMax * 2})`,
    );
  }

  const diferenca = new Float32Array(tauMax + 1);
  const normalizada = new Float32Array(tauMax + 1);
  const resultado = { frequencia: 0, clarity: 0 };

  return {
    tauMin,
    tauMax,
    largura,
    sampleRate,

    /**
     * @param {Float32Array} buffer janela decimada, com pelo menos `tamanho` amostras
     * @returns {{frequencia: number, clarity: number} | null} `null` quando não há
     *          altura confiável no sinal (alimenta a porta de silêncio, FR-4)
     */
    detectar(buffer) {
      // 1. Função diferença: d(τ) = Σ (x[i] − x[i+τ])²
      //    Precisa de todos os τ desde 1, não só a partir de tauMin, porque a
      //    normalização do passo 2 depende da média acumulada até τ.
      diferenca[0] = 0;
      for (let tau = 1; tau <= tauMax; tau += 1) {
        let soma = 0;
        for (let i = 0; i < largura; i += 1) {
          const delta = buffer[i] - buffer[i + tau];
          soma += delta * delta;
        }
        diferenca[tau] = soma;
      }

      // 2. Normalização cumulativa média:
      //    d'(τ) = d(τ) / [(1/τ) Σ_{j=1..τ} d(j)],  d'(0) = 1
      //
      //    Sem isso, d(τ) tende a zero quando τ cresce e o algoritmo escolhe
      //    múltiplos do período — o erro de oitava. Dividir pela média acumulada
      //    penaliza τ grandes e mantém o primeiro vale verdadeiro como o menor.
      normalizada[0] = 1;
      let acumulado = 0;
      for (let tau = 1; tau <= tauMax; tau += 1) {
        acumulado += diferenca[tau];
        normalizada[tau] = acumulado > 0 ? (diferenca[tau] * tau) / acumulado : 1;
      }

      // 3. Limiar absoluto: primeiro τ que cai abaixo do limiar, descendo até o
      //    fundo do vale local. Aceitar o primeiro cruzamento pegaria a borda do
      //    vale, não o mínimo — erro de alguns cents antes mesmo da interpolação.
      let melhorTau = -1;
      for (let tau = tauMin; tau <= tauMax; tau += 1) {
        if (normalizada[tau] < limiar) {
          let t = tau;
          while (t + 1 <= tauMax && normalizada[t + 1] < normalizada[t]) t += 1;
          melhorTau = t;
          break;
        }
      }

      // Nenhum vale convincente: ruído, silêncio ou som sem altura definida.
      if (melhorTau === -1) return null;

      // 4. Interpolação parabólica pelos vizinhos do mínimo.
      //    A 12 kHz um período do B0 tem 389 amostras — degraus de τ inteiro
      //    valem ~4,5 cents. É este passo que entrega o requisito de 1 cent.
      const tauRefinado = refinarPorParabola(normalizada, melhorTau, tauMax);

      resultado.frequencia = sampleRate / tauRefinado;
      resultado.clarity = Math.max(0, Math.min(1, 1 - normalizada[melhorTau]));
      return resultado;
    },
  };
}

/**
 * Vértice da parábola que passa por (τ−1), (τ), (τ+1).
 *
 * Para f(−1)=s0, f(0)=s1, f(1)=s2, o vértice fica em
 *   δ = (s0 − s2) / (2·(s0 − 2·s1 + s2))
 * Denominador ~0 significa três pontos colineares — sem vértice definido, fica
 * o τ inteiro mesmo.
 */
function refinarPorParabola(valores, tau, tauMax) {
  if (tau <= 0 || tau >= tauMax) return tau;

  const s0 = valores[tau - 1];
  const s1 = valores[tau];
  const s2 = valores[tau + 1];

  const denominador = 2 * (s0 - 2 * s1 + s2);
  if (Math.abs(denominador) < 1e-12) return tau;

  const delta = (s0 - s2) / denominador;

  // Um vértice a mais de meia amostra de distância indica que o mínimo inteiro
  // escolhido não era o certo; nesse caso a interpolação não ajuda.
  if (delta < -1 || delta > 1) return tau;

  return tau + delta;
}
