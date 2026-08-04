'use client';

/**
 * Nível do sinal em dBFS, amostrado a ~30 Hz.
 *
 * Serve à verificação da Wave 1 (provar que a captura funciona antes de existir
 * detecção de altura) e, depois, à porta de silêncio do laço de análise.
 *
 * O valor sai por `ref`, não por estado: 30 atualizações por segundo passando
 * pelo React re-renderizariam a árvore inteira sem necessidade (decisions.md D6).
 * Quem quiser mostrar na tela lê a ref dentro do próprio rAF.
 */

import { useCallback, useEffect, useRef } from 'react';

import { nivelDbfs } from '@/lib/pitch/decimate';

const INTERVALO_MS = 1000 / 30;

export function useNivelDeSinal({ ativo, obterAnalisador, aoAtualizar }) {
  const nivelRef = useRef(-Infinity);
  const bufferRef = useRef(null);
  const aoAtualizarRef = useRef(aoAtualizar);

  // Mantém o callback atual sem reiniciar o laço a cada render.
  useEffect(() => {
    aoAtualizarRef.current = aoAtualizar;
  }, [aoAtualizar]);

  useEffect(() => {
    if (!ativo) return undefined;

    let quadro = 0;
    let ultimo = 0;
    let cancelado = false;

    const passo = (agora) => {
      if (cancelado) return;
      quadro = requestAnimationFrame(passo);

      if (agora - ultimo < INTERVALO_MS) return;
      ultimo = agora;

      const analisador = obterAnalisador();
      if (!analisador) return;

      // Buffer alocado uma vez e reaproveitado — nada de alocar por frame (NFR-3).
      if (!bufferRef.current || bufferRef.current.length !== analisador.fftSize) {
        bufferRef.current = new Float32Array(analisador.fftSize);
      }

      analisador.getFloatTimeDomainData(bufferRef.current);
      nivelRef.current = nivelDbfs(bufferRef.current);
      aoAtualizarRef.current?.(nivelRef.current);
    };

    quadro = requestAnimationFrame(passo);
    return () => {
      cancelado = true;
      cancelAnimationFrame(quadro);
    };
  }, [ativo, obterAnalisador]);

  const obterNivel = useCallback(() => nivelRef.current, []);
  return { obterNivel };
}
