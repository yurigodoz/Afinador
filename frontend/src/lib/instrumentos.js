/**
 * Instrumentos, perfis de análise e afinações.
 *
 * Módulo puro: não toca `window`, `AudioContext` nem React (design.md §7).
 *
 * As cordas são declaradas por **número MIDI**, nunca por frequência literal
 * (decisions.md D5). Duas razões: o diapasão ajustável (FR-12) vira uma
 * multiplicação, e some a classe de bug de constante mal digitada — são 26
 * frequências distintas entre os três instrumentos.
 */

const NOTAS_SUSTENIDO = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTAS_BEMOL = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Referência padrão do diapasão, em Hz. Ajustável entre 415 e 466 (FR-12). */
export const A4_PADRAO = 440;
export const A4_MIN = 415;
export const A4_MAX = 466;

/** MIDI 69 = A4, por definição. */
const MIDI_A4 = 69;

/**
 * Frequência de um número MIDI, dado o diapasão.
 * f = a4 · 2^((midi − 69) / 12)
 */
export function midiParaFreq(midi, a4 = A4_PADRAO) {
  return a4 * 2 ** ((midi - MIDI_A4) / 12);
}

/** Número MIDI (fracionário) de uma frequência — inverso de `midiParaFreq`. */
export function freqParaMidi(freq, a4 = A4_PADRAO) {
  return MIDI_A4 + 12 * Math.log2(freq / a4);
}

/**
 * Nome da nota com oitava — "E2", "Eb2".
 *
 * A grafia importa: baixista lê "Eb / Ab / Db" na afinação de meio tom abaixo,
 * não "D# / G# / C#" (decisions.md D5). Por isso cada preset declara a sua.
 */
export function nomeDaNota(midi, grafia = 'sustenido') {
  const tabela = grafia === 'bemol' ? NOTAS_BEMOL : NOTAS_SUSTENIDO;
  const indice = ((midi % 12) + 12) % 12;
  const oitava = Math.floor(midi / 12) - 1;
  return `${tabela[indice]}${oitava}`;
}

/*
 * Perfis de análise (design.md §3).
 *
 * Não existe um conjunto único de parâmetros: a corda mais grave do baixo de 5
 * (B0 = 30,87 Hz) está mais de uma oitava abaixo da do violão (E2 = 82,41 Hz).
 * Cada campo tem justificativa numérica registrada em decisions.md:
 *
 * - `duracaoJanelaMs`: YIN precisa de vários períodos dentro da janela. 85 ms dão
 *   6,3 períodos do D2, mas só 2,6 do B0 — daí 170 ms no baixo (D4).
 * - `taxaAlvoHz`: taxa de trabalho depois da decimação, que é obrigatória e não
 *   otimização opcional (D11).
 * - `fmin`/`fmax`: faixa de busca do τ. Limitar já elimina boa parte dos erros
 *   de oitava e corta o custo do laço.
 * - `notches`: 50 e 60 Hz só no baixo. No violão o zumbido de rede fica abaixo
 *   da faixa de busca; no baixo ele cai *entre* A1 (55 Hz) e D2 (73,42 Hz), e um
 *   highpass que o removesse levaria as duas cordas graves junto (D12).
 *
 * **Janela em tempo, não em amostras.** A versão anterior fixava 4096/8192
 * amostras, o que amarrava o perfil a 48 kHz: num dispositivo de 96 kHz a mesma
 * janela cobre metade do tempo, e o violão caía para 2,8 períodos da nota mais
 * grave — abaixo do que o algoritmo aguenta. `AudioContext.sampleRate` é
 * escolha do hardware, não nossa, então o que precisa ser constante é a duração.
 */
export const PERFIL_VIOLAO = {
  id: 'violao',
  duracaoJanelaMs: 85,
  taxaAlvoHz: 24000,
  fmin: 65,
  fmax: 700,
  highpassHz: 60,
  lowpassHz: 1000,
  notches: [],
  latenciaAlvoMs: 150,
};

export const PERFIL_BAIXO = {
  id: 'baixo',
  duracaoJanelaMs: 170,
  taxaAlvoHz: 12000,
  fmin: 28,
  fmax: 450,
  highpassHz: 25,
  lowpassHz: 500,
  notches: [
    { frequencia: 50, q: 30 },
    { frequencia: 60, q: 30 },
  ],
  latenciaAlvoMs: 250,
};

/** Menor potência de 2 maior ou igual a `n`. */
function proximaPotenciaDeDois(n) {
  return 2 ** Math.ceil(Math.log2(n));
}

/** Limites do `AnalyserNode.fftSize` na Web Audio API. */
const FFT_MIN = 32;
const FFT_MAX = 32768;

/**
 * Tamanho da janela (`fftSize`) para a taxa que o dispositivo entregou.
 *
 * A 48 kHz devolve os valores históricos — 4096 no violão, 8192 no baixo.
 */
export function tamanhoDeJanela(perfil, sampleRate) {
  const bruto = (perfil.duracaoJanelaMs / 1000) * sampleRate;
  const potencia = proximaPotenciaDeDois(bruto);
  return Math.max(FFT_MIN, Math.min(FFT_MAX, potencia));
}

/**
 * Fator de decimação para chegar perto da taxa de trabalho do perfil.
 *
 * Manter a taxa de trabalho estável — e não o fator — é o que mantém o custo do
 * YIN constante entre dispositivos. Num aparelho de 96 kHz um fator fixo de 2
 * deixaria o violão custando quatro vezes mais que num de 48 kHz.
 */
export function fatorDeDecimacao(perfil, sampleRate) {
  return Math.max(1, Math.round(sampleRate / perfil.taxaAlvoHz));
}

/**
 * Afinações por instrumento.
 *
 * `cordas` vai da mais grave para a mais aguda. O número da corda mostrado ao
 * usuário é o índice + 1 nessa ordem invertida (corda 6 = mais grave no violão),
 * calculado em `cordasDaAfinacao`.
 */
export const INSTRUMENTOS = [
  {
    id: 'violao',
    nome: 'Violão / Guitarra',
    quantidadeCordas: 6,
    perfil: PERFIL_VIOLAO,
    afinacoes: [
      { id: 'padrao', nome: 'Padrão (E)', grafia: 'sustenido', cordas: [40, 45, 50, 55, 59, 64] },
      { id: 'drop-d', nome: 'Drop D', grafia: 'sustenido', cordas: [38, 45, 50, 55, 59, 64] },
      { id: 'meio-tom-abaixo', nome: 'Meio tom abaixo (Eb)', grafia: 'bemol', cordas: [39, 44, 49, 54, 58, 63] },
      { id: 'um-tom-abaixo', nome: 'Um tom abaixo (D)', grafia: 'sustenido', cordas: [38, 43, 48, 53, 57, 62] },
      { id: 'dadgad', nome: 'DADGAD', grafia: 'sustenido', cordas: [38, 45, 50, 55, 57, 62] },
      { id: 'open-g', nome: 'Open G', grafia: 'sustenido', cordas: [38, 43, 50, 55, 59, 62] },
    ],
  },
  {
    id: 'baixo-4',
    nome: 'Baixo 4 cordas',
    quantidadeCordas: 4,
    perfil: PERFIL_BAIXO,
    afinacoes: [
      { id: 'padrao', nome: 'Padrão (E)', grafia: 'sustenido', cordas: [28, 33, 38, 43] },
      { id: 'drop-d', nome: 'Drop D', grafia: 'sustenido', cordas: [26, 33, 38, 43] },
      { id: 'meio-tom-abaixo', nome: 'Meio tom abaixo (Eb)', grafia: 'bemol', cordas: [27, 32, 37, 42] },
    ],
  },
  {
    id: 'baixo-5',
    nome: 'Baixo 5 cordas',
    quantidadeCordas: 5,
    perfil: PERFIL_BAIXO,
    afinacoes: [
      { id: 'padrao', nome: 'Padrão (B)', grafia: 'sustenido', cordas: [23, 28, 33, 38, 43] },
    ],
  },
];

export const INSTRUMENTO_PADRAO = 'violao';

export function buscarInstrumento(instrumentoId) {
  return INSTRUMENTOS.find((i) => i.id === instrumentoId) ?? null;
}

export function buscarAfinacao(instrumentoId, afinacaoId) {
  const instrumento = buscarInstrumento(instrumentoId);
  if (!instrumento) return null;
  return instrumento.afinacoes.find((a) => a.id === afinacaoId) ?? null;
}

/**
 * Cordas resolvidas de uma afinação: frequência-alvo, nome e número da corda.
 *
 * Retorna na ordem da mais grave para a mais aguda — a mesma em que aparecem na
 * interface. `numero` é a numeração do músico (6 = mais grave num violão).
 */
export function cordasDaAfinacao(instrumentoId, afinacaoId, a4 = A4_PADRAO) {
  const instrumento = buscarInstrumento(instrumentoId);
  const afinacao = buscarAfinacao(instrumentoId, afinacaoId);
  if (!instrumento || !afinacao) return [];

  const total = afinacao.cordas.length;
  return afinacao.cordas.map((midi, indice) => ({
    id: `${afinacaoId}-${indice}`,
    indice,
    numero: total - indice,
    midi,
    nome: nomeDaNota(midi, afinacao.grafia),
    frequencia: midiParaFreq(midi, a4),
  }));
}

/** Todas as frequências-alvo distintas de todos os presets — usado nos testes. */
export function todosOsMidisDistintos() {
  const conjunto = new Set();
  for (const instrumento of INSTRUMENTOS) {
    for (const afinacao of instrumento.afinacoes) {
      for (const midi of afinacao.cordas) conjunto.add(midi);
    }
  }
  return [...conjunto].sort((a, b) => a - b);
}
