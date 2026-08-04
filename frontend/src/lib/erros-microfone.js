/**
 * Classificação e texto dos erros de acesso ao microfone (FR-2).
 *
 * Módulo puro: recebe o erro (ou booleanos já apurados pelo chamador) e devolve
 * um código e o texto correspondente. Quem olha para `window` é o hook.
 *
 * A razão de isto existir separado: "não consegui acessar o microfone" não
 * ajuda ninguém. As causas pedem ações diferentes — permissão negada se resolve
 * no cadeado da barra de endereço, contexto inseguro só se resolve com HTTPS, e
 * ausência de dispositivo não se resolve no navegador. Errar o diagnóstico manda
 * o usuário para o lugar errado.
 */

export const CODIGO = {
  NEGADO: 'negado',
  SEM_DISPOSITIVO: 'sem-dispositivo',
  DISPOSITIVO_OCUPADO: 'dispositivo-ocupado',
  CONTEXTO_INSEGURO: 'contexto-inseguro',
  SEM_SUPORTE: 'sem-suporte',
  DESCONHECIDO: 'desconhecido',
};

/**
 * Verifica, antes de pedir permissão, se o ambiente sequer permite pedir.
 *
 * @param {{isSecureContext: boolean, temMediaDevices: boolean}} ambiente
 * @returns {string|null} código do impedimento, ou null se está tudo certo
 */
export function verificarAmbiente({ isSecureContext, temMediaDevices }) {
  // A ordem importa: sem HTTPS o `navigator.mediaDevices` nem existe na maioria
  // dos navegadores. Checar o contexto primeiro dá a causa raiz em vez do
  // sintoma — senão todo acesso por IP na rede local viraria "sem suporte".
  if (!isSecureContext) return CODIGO.CONTEXTO_INSEGURO;
  if (!temMediaDevices) return CODIGO.SEM_SUPORTE;
  return null;
}

/**
 * Traduz a exceção do `getUserMedia` em um código.
 *
 * Os nomes legados (`PermissionDeniedError`, `DevicesNotFoundError`) ainda
 * aparecem em navegadores antigos e em alguns WebViews.
 */
export function classificarErro(erro) {
  if (!erro) return CODIGO.DESCONHECIDO;

  switch (erro.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return CODIGO.NEGADO;

    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return CODIGO.SEM_DISPOSITIVO;

    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return CODIGO.DISPOSITIVO_OCUPADO;

    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      // Pedimos o processamento de voz desligado; se nenhum dispositivo aceita
      // essas restrições, o navegador reclama aqui.
      return CODIGO.SEM_DISPOSITIVO;

    case 'TypeError':
      return CODIGO.SEM_SUPORTE;

    default:
      return CODIGO.DESCONHECIDO;
  }
}

const TEXTOS = {
  [CODIGO.NEGADO]: {
    titulo: 'Acesso ao microfone bloqueado',
    mensagem: 'O navegador está bloqueando o microfone para esta página.',
    comoResolver:
      'Toque no cadeado ao lado do endereço, libere o microfone e recarregue a página.',
  },
  [CODIGO.SEM_DISPOSITIVO]: {
    titulo: 'Nenhum microfone encontrado',
    mensagem: 'O navegador não achou nenhuma entrada de áudio neste aparelho.',
    comoResolver: 'Conecte um microfone ou fone com microfone e tente de novo.',
  },
  [CODIGO.DISPOSITIVO_OCUPADO]: {
    titulo: 'Microfone em uso',
    mensagem: 'Outro programa parece estar usando o microfone agora.',
    comoResolver:
      'Feche chamadas, gravadores ou outras abas que estejam com o microfone aberto e tente de novo.',
  },
  [CODIGO.CONTEXTO_INSEGURO]: {
    titulo: 'Esta página precisa de HTTPS',
    mensagem:
      'Navegadores só liberam o microfone em páginas seguras. Este endereço não está em HTTPS.',
    comoResolver: 'Abra o afinador pelo endereço começando com https://.',
  },
  [CODIGO.SEM_SUPORTE]: {
    titulo: 'Navegador sem suporte',
    mensagem: 'Este navegador não oferece a API de captura de áudio que o afinador usa.',
    comoResolver: 'Tente pelo Chrome, Edge, Firefox ou Safari em versão atual.',
  },
  [CODIGO.DESCONHECIDO]: {
    titulo: 'Não foi possível abrir o microfone',
    mensagem: 'Algo impediu o acesso ao microfone, e o navegador não disse o quê.',
    comoResolver: 'Recarregue a página e tente de novo.',
  },
};

/**
 * Reconhece endereços que só existem em desenvolvimento.
 *
 * Serve para a dica técnica do contexto inseguro aparecer só para quem pode
 * agir sobre ela. Em produção, mandar o visitante "rodar npm run dev:https"
 * seria instrução sem sentido — e passa a impressão de que o site está quebrado
 * por descuido.
 */
export function pareceDesenvolvimento(hostname) {
  if (!hostname) return false;
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
  if (hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') return true;

  // Faixas privadas: 10.x, 192.168.x e 172.16–31.x
  if (/^10\./.test(hostname) || /^192\.168\./.test(hostname)) return true;
  const faixa172 = hostname.match(/^172\.(\d{1,3})\./);
  if (faixa172) {
    const segundo = Number(faixa172[1]);
    return segundo >= 16 && segundo <= 31;
  }

  return false;
}

/**
 * @param {string} codigo
 * @param {{desenvolvimento?: boolean}} [contexto]
 * @returns {{titulo: string, mensagem: string, comoResolver: string, dica?: string}}
 */
export function descreverErro(codigo, { desenvolvimento = false } = {}) {
  const texto = TEXTOS[codigo] ?? TEXTOS[CODIGO.DESCONHECIDO];

  if (codigo === CODIGO.CONTEXTO_INSEGURO && desenvolvimento) {
    return {
      ...texto,
      dica: 'Em desenvolvimento: use localhost na própria máquina, ou `npm run dev:https` para abrir pelo IP da rede.',
    };
  }

  return texto;
}

/**
 * Restrições do `getUserMedia` (FR-1, decisions.md D8).
 *
 * As três flags de processamento de voz vão desligadas. Não é preferência: o
 * AGC modula a amplitude entre frames e o supressor de ruído ataca parciais
 * graves e sustentados — exatamente o material que define a corda mais grave.
 * No baixo, cuja tessitura inteira está abaixo da banda da fala, deixá-las
 * ligadas inviabiliza a detecção.
 */
export function restricoesDeAudio() {
  return {
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    },
    video: false,
  };
}
