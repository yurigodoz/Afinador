'use client';

/**
 * Mantém a tela acesa enquanto o afinador está capturando.
 *
 * Afinar seis cordas leva mais tempo que o tempo de apagamento automático da
 * maioria dos celulares, e as mãos estão ocupadas com o instrumento — tocar na
 * tela para reacendê-la é justamente o que não dá para fazer.
 *
 * Usa a Screen Wake Lock API. Exige contexto seguro, que o afinador já precisa
 * ter de qualquer forma (D9), e existe em Chrome, Edge, Android e Safari do iOS
 * a partir do 16.4. Onde não existir, o hook simplesmente não faz nada — a tela
 * apagar é incômodo, não impedimento.
 */

import { useEffect, useRef } from 'react';

export function useTelaAcesa(ativo) {
  const sentinelaRef = useRef(null);

  useEffect(() => {
    if (!ativo) return undefined;
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return undefined;

    let cancelado = false;

    const solicitar = async () => {
      if (cancelado || document.visibilityState !== 'visible') return;
      try {
        sentinelaRef.current = await navigator.wakeLock.request('screen');
      } catch {
        // O sistema pode recusar — bateria baixa, modo de economia, política do
        // aparelho. Não é erro: o afinador continua funcionando, só não segura
        // a tela.
      }
    };

    // O navegador solta a trava sozinho quando a aba deixa de estar visível.
    // Sem repedir ao voltar, a tela volta a apagar no meio da afinação.
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === 'visible' && !sentinelaRef.current) solicitar();
    };

    const aoLiberar = () => {
      sentinelaRef.current = null;
    };

    solicitar().then(() => {
      sentinelaRef.current?.addEventListener('release', aoLiberar);
    });

    document.addEventListener('visibilitychange', aoMudarVisibilidade);

    return () => {
      cancelado = true;
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      sentinelaRef.current?.removeEventListener('release', aoLiberar);
      sentinelaRef.current?.release().catch(() => {});
      sentinelaRef.current = null;
    };
  }, [ativo]);
}
