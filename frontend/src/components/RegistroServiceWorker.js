'use client';

/**
 * Registra o service worker e avisa quando há versão nova.
 *
 * O aviso não é enfeite. Num app em cache, sem ele o usuário fica preso numa
 * versão antiga sem saber — e neste projeto as correções vêm de teste em
 * instrumento real, então ficar preso significa continuar com um bug já
 * resolvido. A troca só acontece quando ele aceita: substituir o app no meio de
 * uma afinação é pior que esperar.
 */

import { useEffect, useState } from 'react';

export default function RegistroServiceWorker() {
  const [aguardando, setAguardando] = useState(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined;

    let cancelado = false;

    const registrar = async () => {
      try {
        const registro = await navigator.serviceWorker.register('/sw.js');
        if (cancelado) return;

        if (registro.waiting) setAguardando(registro.waiting);

        registro.addEventListener('updatefound', () => {
          const novo = registro.installing;
          if (!novo) return;
          novo.addEventListener('statechange', () => {
            // `controller` nulo significa primeira instalação: não há versão
            // anterior para trocar, e avisar seria confuso.
            if (novo.state === 'installed' && navigator.serviceWorker.controller) {
              setAguardando(novo);
            }
          });
        });
      } catch {
        // Sem service worker o afinador funciona normalmente, só não offline.
      }
    };

    // Depois da carga: registrar durante ela disputa banda com os próprios
    // arquivos da página.
    if (document.readyState === 'complete') registrar();
    else window.addEventListener('load', registrar, { once: true });

    return () => {
      cancelado = true;
    };
  }, []);

  if (!aguardando) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
      <div
        role="status"
        className="flex items-center gap-3 rounded-xl border border-borda bg-superficie px-4 py-3 text-sm shadow-lg"
      >
        <span className="text-texto-fraco">Nova versão disponível</span>
        <button
          type="button"
          className="min-h-9 rounded-lg bg-afinado px-3 text-sm font-medium text-fundo"
          onClick={() => {
            aguardando.postMessage('TROCAR_AGORA');
            // O novo worker assume e a página recarrega já com ele no controle.
            navigator.serviceWorker.addEventListener(
              'controllerchange',
              () => window.location.reload(),
              { once: true },
            );
          }}
        >
          Atualizar
        </button>
      </div>
    </div>
  );
}
