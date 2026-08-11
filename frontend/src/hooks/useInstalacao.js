'use client';

/**
 * Detecta se o app já está instalado e, se não estiver, se há como instalar.
 *
 * Dois caminhos, e eles não se parecem:
 *
 * - **Chromium (Android, desktop):** dispara `beforeinstallprompt`. Guardando o
 *   evento, dá para abrir o diálogo de instalação com um clique. O navegador
 *   **não** dispara o evento se o app já estiver instalado — então recebê-lo já
 *   é a resposta para "está instalado?".
 * - **iOS:** nenhum navegador expõe o evento, porque todos usam o WebKit do
 *   sistema. Instalar é manual, pelo menu de compartilhamento. Resta explicar.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { CHAVE_DISPENSA, deveConvidar, lerDispensa, pareceIOS } from '@/lib/instalacao';

/** Rodando como app instalado, e não numa aba do navegador. */
function estaInstalado() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // Safari do iOS, anterior ao suporte a display-mode.
  return window.navigator?.standalone === true;
}

function assinarModoDeExibicao(aoMudar) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const consulta = window.matchMedia('(display-mode: standalone)');
  consulta.addEventListener('change', aoMudar);
  return () => consulta.removeEventListener('change', aoMudar);
}

/**
 * iPadOS recente se identifica como Mac; o que o denuncia é ter tela sensível
 * ao toque. Por isso a checagem mora aqui, e não no módulo puro.
 */
function ehIOS() {
  if (typeof navigator === 'undefined') return false;
  if (pareceIOS(navigator.userAgent)) return true;
  return /Mac/i.test(navigator.userAgent ?? '') && navigator.maxTouchPoints > 1;
}

const semAssinatura = () => () => {};

/*
 * Dispensa guardada, lida como fonte externa — mesmo padrão do `usePreferencias`.
 * Ler `localStorage` num efeito e jogar no estado provoca render em cascata; o
 * `useSyncExternalStore` existe exatamente para este caso e ainda resolve o
 * render no servidor, onde não há armazenamento.
 *
 * O cache por texto cru é obrigatório: `getSnapshot` precisa devolver o mesmo
 * valor enquanto nada mudar, ou o React entra em laço de renders.
 */
const ouvintesDispensa = new Set();
let dispensaBruta = null;
let dispensaValor = null;

function lerDispensaDoArmazenamento() {
  let bruto = null;
  try {
    bruto = window.localStorage.getItem(CHAVE_DISPENSA);
  } catch {
    // Armazenamento bloqueado — o convite simplesmente aparece.
  }
  if (bruto !== dispensaBruta) {
    dispensaBruta = bruto;
    dispensaValor = lerDispensa(bruto);
  }
  return dispensaValor;
}

function assinarDispensa(aoMudar) {
  ouvintesDispensa.add(aoMudar);
  window.addEventListener('storage', aoMudar);
  return () => {
    ouvintesDispensa.delete(aoMudar);
    window.removeEventListener('storage', aoMudar);
  };
}

export function useInstalacao() {
  const instalado = useSyncExternalStore(
    assinarModoDeExibicao,
    estaInstalado,
    () => false,
  );

  const ios = useSyncExternalStore(semAssinatura, ehIOS, () => false);

  const dispensadoEm = useSyncExternalStore(
    assinarDispensa,
    lerDispensaDoArmazenamento,
    () => null,
  );

  const [promptNativo, setPromptNativo] = useState(null);

  useEffect(() => {
    const aoOferecer = (evento) => {
      // Sem isto o Chrome mostra o próprio banner, em cima do nosso.
      evento.preventDefault();
      setPromptNativo(evento);
    };
    const aoInstalar = () => setPromptNativo(null);

    window.addEventListener('beforeinstallprompt', aoOferecer);
    window.addEventListener('appinstalled', aoInstalar);
    return () => {
      window.removeEventListener('beforeinstallprompt', aoOferecer);
      window.removeEventListener('appinstalled', aoInstalar);
    };
  }, []);

  const instalar = useCallback(async () => {
    if (!promptNativo) return false;
    promptNativo.prompt();
    const { outcome } = await promptNativo.userChoice;
    // O evento só pode ser usado uma vez.
    setPromptNativo(null);
    return outcome === 'accepted';
  }, [promptNativo]);

  const dispensar = useCallback(() => {
    const agora = Date.now();
    try {
      window.localStorage.setItem(CHAVE_DISPENSA, String(agora));
    } catch {
      // Não poder guardar significa que o convite volta na próxima visita; o
      // valor abaixo ao menos o esconde nesta.
      dispensaBruta = null;
      dispensaValor = agora;
    }
    for (const ouvinte of ouvintesDispensa) ouvinte();
  }, []);

  return {
    instalado,
    convidar: deveConvidar({
      instalado,
      temPromptNativo: promptNativo !== null,
      ios,
      dispensadoEm,
    }),
    /** No iOS o convite é instrução, não botão. */
    manual: ios && promptNativo === null,
    instalar,
    dispensar,
  };
}
