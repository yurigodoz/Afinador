/**
 * Da frequência detectada para o que a tela precisa mostrar.
 *
 * Fica em `lib` (puro, testável em Node) de propósito: é aqui que moram as
 * regras do FR-5, FR-6, FR-7 e FR-10, e são elas que decidem se o afinador
 * manda apertar ou afrouxar. Testar isso dentro de um componente React exigiria
 * navegador para verificar aritmética.
 */

import { cordaMaisProxima, direcao, notaCromatica } from './cents.js';

/**
 * Meia-abertura do arco do mostrador, em cents.
 *
 * Vive aqui e não no componente porque "o desvio passou da escala" é informação
 * que a interface precisa comunicar em palavras, não só pela posição do ponteiro
 * (NFR-6) — e um ponteiro cravado na ponta é indistinguível de um ponteiro
 * travado.
 */
export const ESCALA_CENTS = 50;

/**
 * @typedef {object} Leitura
 * @property {number|null} frequencia   frequência estabilizada, em Hz
 * @property {number} clarity           confiança do detector, 0 a 1
 * @property {object|null} corda        corda-alvo escolhida
 * @property {number|null} cents        desvio em relação ao alvo
 * @property {boolean} foraDaAfinacao   detectado longe de qualquer corda (FR-6)
 * @property {boolean} travada          alvo veio de escolha manual (FR-10)
 * @property {object|null} nota         nota cromática, quando fora da afinação
 * @property {string} direcao           'aperte' | 'afrouxe' | 'afinado'
 */

/** Estado de "sem sinal": tudo nulo, mas com a forma completa. */
export const LEITURA_VAZIA = Object.freeze({
  frequencia: null,
  clarity: 0,
  corda: null,
  cents: null,
  foraDaAfinacao: false,
  travada: false,
  nota: null,
  direcao: 'afinado',
  foraDaEscala: false,
});

/**
 * Monta a leitura exibível.
 *
 * @param {object}   entrada
 * @param {number|null} entrada.frequencia  já passada pela mediana e retenção
 * @param {number}   entrada.clarity
 * @param {Array}    entrada.cordas         cordas da afinação atual
 * @param {string|null} entrada.cordaTravada id da corda travada, se houver (FR-10)
 * @param {number}   entrada.a4
 * @returns {Leitura}
 */
export function montarLeitura({ frequencia, clarity = 0, cordas, cordaTravada = null, a4 }) {
  if (frequencia === null || !Number.isFinite(frequencia) || frequencia <= 0) {
    return LEITURA_VAZIA;
  }

  // Corda travada manualmente: compara só com ela, mesmo que outra esteja mais
  // perto. É o escape para corda tão desafinada que cai mais perto da vizinha —
  // sem isto o afinador guiaria o usuário para a nota errada com confiança.
  if (cordaTravada) {
    const alvo = cordas.find((c) => c.id === cordaTravada);
    if (alvo) {
      const desvio = 1200 * Math.log2(frequencia / alvo.frequencia);
      return {
        frequencia,
        clarity,
        corda: alvo,
        cents: desvio,
        // Travada, a distância não descaracteriza o alvo: o usuário escolheu.
        foraDaAfinacao: false,
        travada: true,
        nota: notaCromatica(frequencia, a4),
        direcao: direcao(desvio),
        foraDaEscala: Math.abs(desvio) > ESCALA_CENTS,
      };
    }
  }

  const proxima = cordaMaisProxima(frequencia, cordas);
  if (!proxima) return LEITURA_VAZIA;

  // Longe de qualquer corda do preset: mostrar a nota cromática é mais honesto
  // que fingir que a corda mais próxima é o alvo (FR-6).
  if (proxima.foraDaAfinacao) {
    return {
      frequencia,
      clarity,
      corda: null,
      cents: null,
      foraDaAfinacao: true,
      travada: false,
      nota: notaCromatica(frequencia, a4),
      direcao: 'afinado',
      foraDaEscala: false,
    };
  }

  return {
    frequencia,
    clarity,
    corda: proxima.corda,
    cents: proxima.cents,
    foraDaAfinacao: false,
    travada: false,
    nota: null,
    direcao: direcao(proxima.cents),
    foraDaEscala: Math.abs(proxima.cents) > ESCALA_CENTS,
  };
}

/**
 * Frase para leitor de tela (NFR-6).
 *
 * A interface comunica estado por cor e posição de ponteiro; quem usa leitor de
 * tela não tem nenhum dos dois. Esta frase é a informação equivalente.
 */
export function descreverLeitura(leitura) {
  if (!leitura || leitura.frequencia === null) return 'Aguardando som.';

  if (leitura.foraDaAfinacao) {
    return `Nota ${leitura.nota?.nome ?? 'desconhecida'}, fora desta afinação.`;
  }

  if (!leitura.corda) return 'Aguardando som.';

  const arredondado = Math.round(leitura.cents);

  if (leitura.direcao === 'afinado') {
    return `Corda ${leitura.corda.numero}, ${leitura.corda.nome}, afinada.`;
  }

  const distancia = Math.abs(arredondado);
  const sentido = arredondado < 0 ? 'abaixo' : 'acima';
  const muito = leitura.foraDaEscala ? 'muito ' : '';
  return `Corda ${leitura.corda.numero}, ${leitura.corda.nome}, ${muito}${distancia} cents ${sentido}, ${leitura.direcao}.`;
}
