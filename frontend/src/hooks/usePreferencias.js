'use client';

/**
 * Preferências persistidas em `localStorage` (FR-0, FR-11, FR-12).
 *
 * Não há backend (decisions.md D1), então é aqui que instrumento, afinação e
 * diapasão sobrevivem entre visitas.
 *
 * **Por que `useSyncExternalStore` e não `useEffect`.** O padrão comum — estado
 * inicial padrão e hidratação num efeito — provoca render em cascata e é
 * sinalizado pelas regras do React. `localStorage` é literalmente uma fonte
 * externa de dados, que é o caso de uso desta API: ela resolve a leitura no
 * servidor (onde `localStorage` não existe) por um `getServerSnapshot`
 * separado, sem divergência de hidratação. De brinde, o evento `storage` mantém
 * duas abas do afinador em sincronia.
 */

import { useCallback, useSyncExternalStore } from 'react';

import {
  CHAVE_ARMAZENAMENTO,
  PREFERENCIAS_PADRAO,
  normalizarPreferencias,
} from '@/lib/preferencias';

/** Assinantes locais: o evento `storage` só dispara em *outras* abas. */
const ouvintes = new Set();

/*
 * `getSnapshot` precisa devolver a **mesma referência** enquanto nada mudar, ou
 * o React entra em laço infinito de renders. Daí o cache indexado pelo texto
 * cru: só se reparseia quando o conteúdo realmente mudou.
 */
let brutoEmCache = null;
let valorEmCache = PREFERENCIAS_PADRAO;

function lerArmazenamento() {
  try {
    return window.localStorage.getItem(CHAVE_ARMAZENAMENTO);
  } catch {
    // Armazenamento bloqueado (navegação privada em alguns navegadores).
    return null;
  }
}

function obterSnapshot() {
  const bruto = lerArmazenamento();
  if (bruto === brutoEmCache) return valorEmCache;

  brutoEmCache = bruto;
  try {
    valorEmCache = bruto ? normalizarPreferencias(JSON.parse(bruto)) : PREFERENCIAS_PADRAO;
  } catch {
    // JSON corrompido — os padrões seguem valendo.
    valorEmCache = PREFERENCIAS_PADRAO;
  }
  return valorEmCache;
}

/** No servidor não há armazenamento; a referência é estável e congelada. */
function obterSnapshotDoServidor() {
  return PREFERENCIAS_PADRAO;
}

function assinar(aoMudar) {
  ouvintes.add(aoMudar);
  window.addEventListener('storage', aoMudar);
  return () => {
    ouvintes.delete(aoMudar);
    window.removeEventListener('storage', aoMudar);
  };
}

function notificar() {
  for (const ouvinte of ouvintes) ouvinte();
}

export function usePreferencias() {
  const preferencias = useSyncExternalStore(assinar, obterSnapshot, obterSnapshotDoServidor);

  const atualizar = useCallback((mudancas) => {
    const proximo = normalizarPreferencias({ ...obterSnapshot(), ...mudancas });
    try {
      window.localStorage.setItem(CHAVE_ARMAZENAMENTO, JSON.stringify(proximo));
    } catch {
      // Não poder salvar não pode impedir de usar. O valor abaixo mantém a
      // preferência valendo nesta sessão, mesmo sem persistir.
      brutoEmCache = null;
      valorEmCache = proximo;
    }
    notificar();
  }, []);

  return { preferencias, atualizar };
}
