'use client';

/**
 * Laço de análise: do áudio ao vivo para a leitura exibível (Task 5).
 *
 * Estrutura do frame, na ordem (design.md §3 e §4):
 *
 *   RMS → [porta de silêncio] → decimação → YIN → mediana → exponencial → histerese
 *
 * A porta vem antes de tudo porque descartar cedo economiza o passo caro: sem
 * sinal não se roda decimação nem YIN.
 *
 * **Por que quase nada aqui passa por `setState`** (decisions.md D6): o laço roda
 * a 30 Hz. Empurrar cada leitura pelo React re-renderizaria a árvore inteira 30
 * vezes por segundo, e o número no mostrador não fica mais correto por isso. Os
 * valores contínuos saem por callback, para quem quiser escrever direto no DOM;
 * `setState` só dispara em **mudança discreta** — trocou a corda ativa, entrou ou
 * saiu de afinado, ganhou ou perdeu sinal.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  LIMIAR_SILENCIO_DBFS,
  criarDecimador,
  nivelDbfs,
} from '@/lib/pitch/decimate';
import { LEITURA_VAZIA, montarLeitura } from '@/lib/pitch/leitura';
import {
  criarConfirmadorAfinado,
  criarFiltroFrequencia,
  criarSuavizadorCents,
} from '@/lib/pitch/smoothing';
import { criarDetector } from '@/lib/pitch/yin';
import { fatorDeDecimacao, tamanhoDeJanela } from '@/lib/instrumentos';

const INTERVALO_MS = 1000 / 30;

/** Abaixo disto a estimativa não é confiável o bastante para virar leitura. */
const CLARITY_MINIMA = 0.7;

/**
 * @param {object} params
 * @param {boolean} params.ativo
 * @param {() => AnalyserNode|null} params.obterAnalisador
 * @param {() => number|null} params.obterSampleRate
 * @param {object} params.perfil          perfil de análise do instrumento
 * @param {Array}  params.cordas          cordas da afinação atual
 * @param {string|null} params.cordaTravada
 * @param {number} params.a4
 * @param {(leitura: object) => void} [params.aoLerContinuo] chamado a cada frame
 */
export function useDeteccaoAltura({
  ativo,
  obterAnalisador,
  obterSampleRate,
  perfil,
  cordas,
  cordaTravada = null,
  a4,
  aoLerContinuo,
}) {
  const [leitura, setLeitura] = useState(LEITURA_VAZIA);
  const [afinada, setAfinada] = useState(false);

  // Tudo o que o laço lê fica em ref: o laço é montado uma vez por perfil, e não
  // pode ser recriado a cada mudança de corda travada ou de diapasão.
  const cordasRef = useRef(cordas);
  const travadaRef = useRef(cordaTravada);
  const a4Ref = useRef(a4);
  const contínuoRef = useRef(aoLerContinuo);
  const ultimaChaveRef = useRef(null);

  /*
   * Sinaliza ao laço que os alvos mudaram e a leitura retida não vale mais.
   *
   * Sem isto acontece o seguinte: a retenção do FR-4 segura a última frequência
   * por 400 ms para o mostrador não piscar entre dedilhadas. Se o usuário trava
   * uma corda nesse intervalo, a nota **anterior** passa a ser comparada com o
   * alvo **novo** — tocando o E2 e travando no D3, o mostrador acusa −1000 cents
   * e crava o ponteiro à esquerda. O número está certo e não serve para nada:
   * descreve um som que já acabou, contra um alvo que ainda não foi tocado.
   */
  const limparRef = useRef(false);

  useEffect(() => {
    cordasRef.current = cordas;
    limparRef.current = true;
  }, [cordas]);
  useEffect(() => {
    travadaRef.current = cordaTravada;
    limparRef.current = true;
  }, [cordaTravada]);
  useEffect(() => {
    a4Ref.current = a4;
  }, [a4]);
  useEffect(() => {
    contínuoRef.current = aoLerContinuo;
  }, [aoLerContinuo]);

  /**
   * Motor de análise para o par (perfil, taxa do dispositivo).
   *
   * Construído em `useMemo` e não dentro do efeito porque a construção pode
   * falhar — taxa incompatível com a faixa de busca, por exemplo — e uma falha
   * derivável no render dispensa `setState` dentro de efeito, que provocaria
   * render em cascata.
   */
  const motor = useMemo(() => {
    if (!ativo) return null;

    const sampleRate = obterSampleRate();
    if (!sampleRate) return null;

    const janela = tamanhoDeJanela(perfil, sampleRate);
    const fator = fatorDeDecimacao(perfil, sampleRate);

    try {
      const decimador = criarDecimador(janela, fator);
      const detector = criarDetector({
        tamanho: decimador.tamanhoSaida,
        sampleRate: sampleRate / fator,
        fmin: perfil.fmin,
        fmax: perfil.fmax,
      });
      return { janela, decimador, detector, buffer: new Float32Array(janela), erro: null };
    } catch (excecao) {
      // Configuração impossível neste dispositivo. Ficar em "aguardando" é mais
      // honesto que exibir nota inventada.
      return { erro: excecao.message };
    }
  }, [ativo, perfil, obterSampleRate]);

  useEffect(() => {
    if (!motor || motor.erro) return undefined;

    const { janela, decimador, detector, buffer } = motor;
    const filtro = criarFiltroFrequencia();
    const suavizador = criarSuavizadorCents();
    const confirmador = criarConfirmadorAfinado();

    let quadro = 0;
    let ultimo = 0;
    let cancelado = false;

    const passo = (agora) => {
      if (cancelado) return;
      quadro = requestAnimationFrame(passo);
      if (agora - ultimo < INTERVALO_MS) return;
      ultimo = agora;

      const analisador = obterAnalisador();
      if (!analisador || analisador.fftSize !== janela) return;

      // Alvos mudaram: joga fora a leitura retida e recomeça do zero. Melhor
      // exibir "aguardando" por um instante do que descrever a nota anterior
      // contra o alvo novo.
      if (limparRef.current) {
        limparRef.current = false;
        filtro.reiniciar();
        suavizador.reiniciar();
        confirmador.reiniciar();
        ultimaChaveRef.current = null;
        contínuoRef.current?.(LEITURA_VAZIA, false);
        setLeitura(LEITURA_VAZIA);
        setAfinada(false);
        return;
      }

      analisador.getFloatTimeDomainData(buffer);

      // Porta de silêncio (FR-4): abaixo do limiar nem vale rodar o YIN.
      const temSinal = nivelDbfs(buffer) >= LIMIAR_SILENCIO_DBFS;
      const bruta = temSinal ? detector.detectar(decimador.decimar(buffer)) : null;

      const aceitavel = bruta && bruta.clarity >= CLARITY_MINIMA ? bruta.frequencia : null;
      const estavel = filtro.processar(aceitavel, agora);

      // Sinal perdido: o suavizador precisa esquecer o desvio antigo. A mediana
      // de frequência já se reinicia sozinha ao expirar a retenção, mas o valor
      // em cents sobreviveria ao silêncio — e a próxima nota entraria deslizando
      // a partir dele, em vez de ser lida como é.
      if (estavel === null) suavizador.reiniciar();

      const cordasAtuais = cordasRef.current;
      const parcial = montarLeitura({
        frequencia: estavel,
        clarity: bruta?.clarity ?? 0,
        cordas: cordasAtuais,
        cordaTravada: travadaRef.current,
        a4: a4Ref.current,
      });

      // A suavização é em cents e por alvo: trocar de corda reinicia, senão o
      // primeiro valor da corda nova sai contaminado pelo desvio da anterior.
      const chaveAlvo = parcial.corda?.id ?? (parcial.foraDaAfinacao ? 'fora' : null);
      const centsSuaves =
        parcial.cents === null ? null : suavizador.processar(parcial.cents, chaveAlvo);

      const completa =
        centsSuaves === null ? parcial : { ...parcial, cents: centsSuaves };

      const confirmada = confirmador.processar(centsSuaves, chaveAlvo, agora);

      contínuoRef.current?.(completa, confirmada);

      // Só o que é discreto atravessa o React.
      const chaveDiscreta = [
        completa.corda?.id ?? '-',
        completa.foraDaAfinacao ? 'fora' : '-',
        completa.frequencia === null ? 'sem-sinal' : 'com-sinal',
        completa.direcao,
        confirmada ? 'afinada' : '-',
      ].join('|');

      if (chaveDiscreta !== ultimaChaveRef.current) {
        ultimaChaveRef.current = chaveDiscreta;
        setLeitura(completa);
        setAfinada(confirmada);
      }
    };

    quadro = requestAnimationFrame(passo);
    return () => {
      cancelado = true;
      cancelAnimationFrame(quadro);
      ultimaChaveRef.current = null;
    };
  }, [motor, obterAnalisador]);

  const reiniciar = useCallback(() => {
    ultimaChaveRef.current = null;
    setLeitura(LEITURA_VAZIA);
    setAfinada(false);
  }, []);

  // Derivado, não sincronizado: sem captura (ou sem motor válido) não existe
  // leitura, e derivar evita um render só para zerar estado.
  const valido = ativo && motor && !motor.erro;

  return {
    leitura: valido ? leitura : LEITURA_VAZIA,
    afinada: valido ? afinada : false,
    erroDeConfiguracao: motor?.erro ?? null,
    reiniciar,
  };
}
