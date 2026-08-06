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

/**
 * Quanto tempo a detecção fica suspensa depois que o tom para.
 *
 * Precisa ser **maior que o tempo de confirmação de afinado** (700 ms, em
 * `criarConfirmadorAfinado`) — ver a explicação no corpo do hook.
 */
const ACOMODACAO_MS = 900;

export function useTomReferencia() {
  const [tocando, setTocando] = useState(null);
  const contextoRef = useRef(null);
  const osciladorRef = useRef(null);
  const ganhoRef = useRef(null);

  /*
   * Acomodação depois que o tom para.
   *
   * O tom de referência sai na frequência-alvo **exata**. Se a detecção medir
   * esse som, dá 0 cents e o afinador confirma a corda como afinada usando o
   * som que ele mesmo emitiu — afina a si mesmo, sem o instrumento ter sido
   * tocado.
   *
   * Suspender a detecção só enquanto o tom soa não basta: a rampa de 15 ms do
   * envelope, o alto-falante e a ressonância do cômodo continuam soando depois
   * do comando de parar.
   *
   * A janela precisa ser **maior que o tempo de confirmação de afinado**
   * (700 ms). Uma tentativa anterior usou 600 ms e falhou por isso: a cauda do
   * tom seguia alimentando leituras de 0 cent, a confirmação completava aos
   * 700 ms e a proteção já tinha expirado. Guarda mais curta que o evento que
   * deveria impedir não protege nada.
   */
  const [acomodando, setAcomodando] = useState(false);
  const timerAcomodacaoRef = useRef(null);

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

    // Só entra em acomodação se havia algo soando.
    if (oscilador) {
      if (timerAcomodacaoRef.current) clearTimeout(timerAcomodacaoRef.current);
      setAcomodando(true);
      timerAcomodacaoRef.current = setTimeout(() => {
        timerAcomodacaoRef.current = null;
        setAcomodando(false);
      }, ACOMODACAO_MS);
    }
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

  /**
   * Liga ou desliga o tom da corda indicada.
   *
   * Alternar, e não tocar-enquanto-segura: no celular manter o dedo no botão
   * disputa com a rolagem da página, e — o que importa mais — deixa a mão presa
   * justamente quando ela precisaria estar girando a tarraxa.
   */
  const alternar = useCallback(
    (corda) => {
      if (!corda) return;
      if (tocando?.cordaId === corda.id) parar();
      else tocar(corda);
    },
    [tocando, tocar, parar],
  );

  useEffect(
    () => () => {
      if (timerAcomodacaoRef.current) clearTimeout(timerAcomodacaoRef.current);
      parar();
    },
    [parar],
  );

  return {
    tocar,
    parar,
    alternar,
    tocando,
    /**
     * Enquanto verdadeiro, a detecção precisa ficar suspensa: ou o tom está
     * soando, ou acabou de parar e o ambiente ainda ecoa. Suspender é mais
     * seguro que filtrar depois — o que não é medido não pode virar confirmação.
     */
    silenciando: tocando !== null || acomodando,
  };
}
