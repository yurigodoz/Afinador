'use client';

/**
 * Captura de áudio e montagem do grafo (FR-0, FR-1, FR-14).
 *
 * Este hook concentra todo o efeito colateral de áudio do projeto. Os módulos de
 * `src/lib` permanecem puros justamente porque tudo o que toca `navigator`,
 * `AudioContext` e ciclo de vida de React mora aqui.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  CODIGO,
  classificarErro,
  descreverErro,
  pareceDesenvolvimento,
  restricoesDeAudio,
  verificarAmbiente,
} from '@/lib/erros-microfone';
import { tamanhoDeJanela } from '@/lib/instrumentos';

export const ESTADO = {
  INICIAL: 'inicial',
  PEDINDO: 'pedindo',
  ATIVO: 'ativo',
  ERRO: 'erro',
};

/** Tempo com a aba oculta antes de soltar o microfone (FR-14). */
const OCULTO_ATE_DESLIGAR_MS = 30000;

/**
 * Monta a cadeia de filtros do perfil e devolve os nós criados.
 *
 * O `AnalyserNode` de propósito **não** é conectado ao `destination`: ligar a
 * entrada do microfone na saída produziria realimentação no alto-falante. O
 * analisador funciona como ponto terminal do ramo — é o padrão para análise de
 * entrada ao vivo.
 */
function montarGrafo(contexto, origem, perfil) {
  const nos = [];
  let atual = origem;

  const passaAlta = contexto.createBiquadFilter();
  passaAlta.type = 'highpass';
  passaAlta.frequency.value = perfil.highpassHz;
  passaAlta.Q.value = 0.7;
  atual.connect(passaAlta);
  nos.push(passaAlta);
  atual = passaAlta;

  // Notches de rede elétrica: só o perfil de baixo os traz (decisions.md D12).
  // No violão a faixa de busca começa em 65 Hz e o zumbido fica fora dela.
  for (const { frequencia, q } of perfil.notches) {
    const notch = contexto.createBiquadFilter();
    notch.type = 'notch';
    notch.frequency.value = frequencia;
    notch.Q.value = q;
    atual.connect(notch);
    nos.push(notch);
    atual = notch;
  }

  const passaBaixa = contexto.createBiquadFilter();
  passaBaixa.type = 'lowpass';
  passaBaixa.frequency.value = perfil.lowpassHz;
  passaBaixa.Q.value = 0.7;
  atual.connect(passaBaixa);
  nos.push(passaBaixa);
  atual = passaBaixa;

  const analisador = contexto.createAnalyser();
  // A janela vem da taxa real do dispositivo, não de uma constante: o que
  // precisa ser fixo é a duração em milissegundos (ver `instrumentos.js`).
  analisador.fftSize = tamanhoDeJanela(perfil, contexto.sampleRate);
  // Só lemos o domínio do tempo; a suavização do analisador não se aplica, mas
  // deixar explícito evita dúvida de quem ler depois.
  analisador.smoothingTimeConstant = 0;
  atual.connect(analisador);
  nos.push(analisador);

  return { nos, analisador };
}

function desmontarGrafo(nos) {
  for (const no of nos) {
    try {
      no.disconnect();
    } catch {
      // Nó já desconectado — não há o que fazer nem o que reportar.
    }
  }
}

export function useMicrofone() {
  const [estado, setEstado] = useState(ESTADO.INICIAL);
  const [erro, setErro] = useState(null);

  const contextoRef = useRef(null);
  const streamRef = useRef(null);
  const origemRef = useRef(null);
  const nosRef = useRef([]);
  const analisadorRef = useRef(null);
  const perfilRef = useRef(null);
  const timerOcultoRef = useRef(null);

  const registrarErro = useCallback((codigo) => {
    const desenvolvimento =
      typeof window !== 'undefined' && pareceDesenvolvimento(window.location?.hostname);
    setErro({ codigo, ...descreverErro(codigo, { desenvolvimento }) });
    setEstado(ESTADO.ERRO);
  }, []);

  const parar = useCallback(() => {
    if (timerOcultoRef.current) {
      clearTimeout(timerOcultoRef.current);
      timerOcultoRef.current = null;
    }

    desmontarGrafo(nosRef.current);
    nosRef.current = [];
    analisadorRef.current = null;

    if (origemRef.current) {
      try {
        origemRef.current.disconnect();
      } catch {
        // idem
      }
      origemRef.current = null;
    }

    // Soltar as trilhas é o que apaga o indicador de gravação do navegador. Sem
    // isto o usuário fica com a luz do microfone acesa depois de parar (FR-14).
    if (streamRef.current) {
      for (const trilha of streamRef.current.getTracks()) trilha.stop();
      streamRef.current = null;
    }

    if (contextoRef.current) {
      const contexto = contextoRef.current;
      contextoRef.current = null;
      if (contexto.state !== 'closed') contexto.close().catch(() => {});
    }

    perfilRef.current = null;
    setEstado(ESTADO.INICIAL);
    setErro(null);
  }, []);

  /**
   * Precisa ser chamado a partir de um gesto do usuário: o iOS só sai do estado
   * `suspended` do `AudioContext` dentro do handler do toque (NFR-5).
   */
  const iniciar = useCallback(
    async (perfil) => {
      const impedimento = verificarAmbiente({
        isSecureContext: typeof window !== 'undefined' && window.isSecureContext,
        temMediaDevices:
          typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
      });

      if (impedimento) {
        registrarErro(impedimento);
        return false;
      }

      setEstado(ESTADO.PEDINDO);
      setErro(null);

      try {
        const stream = await navigator.mediaDevices.getUserMedia(restricoesDeAudio());
        streamRef.current = stream;

        const Contexto = window.AudioContext ?? window.webkitAudioContext;
        const contexto = new Contexto();
        contextoRef.current = contexto;

        // Safari entrega o contexto suspenso mesmo criado no gesto.
        if (contexto.state === 'suspended') await contexto.resume();

        const origem = contexto.createMediaStreamSource(stream);
        origemRef.current = origem;

        const { nos, analisador } = montarGrafo(contexto, origem, perfil);
        nosRef.current = nos;
        analisadorRef.current = analisador;
        perfilRef.current = perfil;

        setEstado(ESTADO.ATIVO);
        return true;
      } catch (excecao) {
        // Se o contexto chegou a nascer antes da falha, ele não pode ficar para trás.
        parar();
        registrarErro(classificarErro(excecao));
        return false;
      }
    },
    [parar, registrarErro],
  );

  /**
   * Troca o perfil de análise sem pedir permissão de novo (FR-0).
   *
   * O `MediaStream` e o `AudioContext` são preservados; só a cadeia de
   * processamento é refeita, porque `fftSize` e filtros diferem entre violão e
   * baixo. Recriar tudo faria o navegador reabrir o prompt e reacender a luz do
   * microfone a cada troca de instrumento.
   */
  const trocarPerfil = useCallback((perfil) => {
    const contexto = contextoRef.current;
    const origem = origemRef.current;
    if (!contexto || !origem) return false;
    if (perfilRef.current?.id === perfil.id) return true;

    desmontarGrafo(nosRef.current);
    try {
      origem.disconnect();
    } catch {
      // idem
    }

    const { nos, analisador } = montarGrafo(contexto, origem, perfil);
    nosRef.current = nos;
    analisadorRef.current = analisador;
    perfilRef.current = perfil;
    return true;
  }, []);

  // Aba oculta por tempo prolongado solta o microfone (FR-14). O prazo existe
  // para não desligar quando o usuário só troca de app por alguns segundos para
  // ver uma cifra — nesse caso ele volta e o afinador ainda está de pé.
  useEffect(() => {
    if (estado !== ESTADO.ATIVO) return undefined;

    const aoMudarVisibilidade = () => {
      if (document.hidden) {
        timerOcultoRef.current = setTimeout(parar, OCULTO_ATE_DESLIGAR_MS);
      } else if (timerOcultoRef.current) {
        clearTimeout(timerOcultoRef.current);
        timerOcultoRef.current = null;
      }
    };

    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    return () => document.removeEventListener('visibilitychange', aoMudarVisibilidade);
  }, [estado, parar]);

  // Desmontar o componente tem de soltar o microfone, senão sobra AudioContext
  // órfão a cada navegação.
  useEffect(() => parar, [parar]);

  const obterAnalisador = useCallback(() => analisadorRef.current, []);
  const obterSampleRate = useCallback(() => contextoRef.current?.sampleRate ?? null, []);

  return {
    estado,
    erro,
    ativo: estado === ESTADO.ATIVO,
    iniciar,
    parar,
    trocarPerfil,
    obterAnalisador,
    obterSampleRate,
  };
}

export { CODIGO };
