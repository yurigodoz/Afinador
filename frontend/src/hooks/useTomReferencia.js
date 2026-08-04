'use client';

/**
 * Tom de referência audível (FR-13).
 *
 * Duas sutilezas que não são detalhe:
 *
 * 1. **Envelope curto na entrada e na saída.** Ligar e desligar um oscilador em
 *    amplitude cheia produz um clique audível — descontinuidade no sinal. Uma
 *    rampa de 15 ms resolve.
 * 2. **Alvos graves sobem uma oitava.** Alto-falante de celular não reproduz
 *    30–40 Hz de forma útil; o B0 do baixo (30,87 Hz) sairia inaudível ou como
 *    chiado. Abaixo de 60 Hz o tom soa uma oitava acima, e a interface avisa —
 *    a oitava é informação, não pode ficar escondida.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { frequenciaAudivel } from '@/lib/pitch/referencia';

const RAMPA_S = 0.015;
const GANHO = 0.18;

export function useTomReferencia() {
  const [tocando, setTocando] = useState(null);
  const contextoRef = useRef(null);
  const osciladorRef = useRef(null);
  const ganhoRef = useRef(null);

  const parar = useCallback(() => {
    const contexto = contextoRef.current;
    const oscilador = osciladorRef.current;
    const ganho = ganhoRef.current;

    if (contexto && oscilador && ganho) {
      const agora = contexto.currentTime;
      ganho.gain.cancelScheduledValues(agora);
      ganho.gain.setValueAtTime(ganho.gain.value, agora);
      ganho.gain.linearRampToValueAtTime(0, agora + RAMPA_S);
      oscilador.stop(agora + RAMPA_S + 0.01);
    }

    osciladorRef.current = null;
    ganhoRef.current = null;
    setTocando(null);
  }, []);

  const tocar = useCallback(
    (corda) => {
      if (!corda) return;
      parar();

      const Contexto = window.AudioContext ?? window.webkitAudioContext;
      if (!contextoRef.current || contextoRef.current.state === 'closed') {
        contextoRef.current = new Contexto();
      }
      const contexto = contextoRef.current;
      if (contexto.state === 'suspended') contexto.resume();

      const { frequencia, oitavaAcima } = frequenciaAudivel(corda.frequencia);

      const oscilador = contexto.createOscillator();
      // Onda triangular: mais rica que a senoide, o que ajuda a ouvir a altura
      // em alto-falante pequeno, sem a aspereza da quadrada ou da dente-de-serra.
      oscilador.type = 'triangle';
      oscilador.frequency.value = frequencia;

      const ganho = contexto.createGain();
      const agora = contexto.currentTime;
      ganho.gain.setValueAtTime(0, agora);
      ganho.gain.linearRampToValueAtTime(GANHO, agora + RAMPA_S);

      oscilador.connect(ganho);
      ganho.connect(contexto.destination);
      oscilador.start();

      osciladorRef.current = oscilador;
      ganhoRef.current = ganho;
      setTocando({ cordaId: corda.id, frequencia, oitavaAcima });
    },
    [parar],
  );

  useEffect(() => parar, [parar]);

  return { tocar, parar, tocando };
}
