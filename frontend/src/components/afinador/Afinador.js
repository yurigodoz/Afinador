'use client';

/**
 * Orquestrador da tela do afinador (Tasks 6 a 9).
 *
 * Detém o estado da §8 do design e compõe permissão, mostrador, lista de cordas
 * e controles.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Controles from '@/components/afinador/Controles';
import ListaCordas from '@/components/afinador/ListaCordas';
import Mostrador from '@/components/afinador/Mostrador';
import PermissaoMicrofone from '@/components/afinador/PermissaoMicrofone';
import Botao from '@/components/ui/Botao';
import { useDeteccaoAltura } from '@/hooks/useDeteccaoAltura';
import { ESTADO, useMicrofone } from '@/hooks/useMicrofone';
import { usePreferencias } from '@/hooks/usePreferencias';
import { useTomReferencia } from '@/hooks/useTomReferencia';
import { buscarInstrumento, cordasDaAfinacao } from '@/lib/instrumentos';
import { descreverLeitura } from '@/lib/pitch/leitura';
import { afinacaoAoTrocarInstrumento } from '@/lib/preferencias';

/** Intervalo mínimo entre anúncios do leitor de tela (NFR-6). */
const INTERVALO_ANUNCIO_MS = 1000;

export default function Afinador() {
  const { preferencias, atualizar } = usePreferencias();
  const { instrumentoId, afinacaoId, a4 } = preferencias;

  const [cordaTravada, setCordaTravada] = useState(null);
  const [cordasAfinadas, setCordasAfinadas] = useState(() => new Set());

  const instrumento = useMemo(() => buscarInstrumento(instrumentoId), [instrumentoId]);
  const cordas = useMemo(
    () => cordasDaAfinacao(instrumentoId, afinacaoId, a4),
    [instrumentoId, afinacaoId, a4],
  );

  const microfone = useMicrofone();
  const referencia = useTomReferencia();
  const mostradorRef = useRef(null);
  const anuncioRef = useRef(null);
  const ultimoAnuncioMs = useRef(0);

  // Chamado a cada frame do laço. Escreve direto no DOM — é assim que o ponteiro
  // se move sem passar pelo React (decisions.md D6).
  const aoLerContinuo = useCallback((leituraContinua, confirmada) => {
    mostradorRef.current?.atualizar(leituraContinua.cents);

    if (confirmada && leituraContinua.corda) {
      setCordasAfinadas((atual) => {
        if (atual.has(leituraContinua.corda.id)) return atual;
        const novo = new Set(atual);
        novo.add(leituraContinua.corda.id);
        return novo;
      });
    }
  }, []);

  const { leitura } = useDeteccaoAltura({
    // O tom de referência sai pelo alto-falante e voltaria pelo microfone: o
    // afinador mediria o próprio tom (FR-13). Suspender a detecção enquanto soa
    // é mais simples e mais confiável que tentar filtrar depois.
    ativo: microfone.ativo && !referencia.tocando,
    obterAnalisador: microfone.obterAnalisador,
    obterSampleRate: microfone.obterSampleRate,
    perfil: instrumento.perfil,
    cordas,
    cordaTravada,
    a4,
    aoLerContinuo,
  });

  useEffect(() => {
    const agora = Date.now();
    if (agora - ultimoAnuncioMs.current < INTERVALO_ANUNCIO_MS) return;
    ultimoAnuncioMs.current = agora;
    if (anuncioRef.current) anuncioRef.current.textContent = descreverLeitura(leitura);
  }, [leitura]);

  const reiniciarProgresso = useCallback(() => {
    setCordasAfinadas(new Set());
    setCordaTravada(null);
    referencia.parar();
  }, [referencia]);

  const aoTrocarInstrumento = useCallback(
    (novoId) => {
      if (novoId === instrumentoId) return;
      const novo = buscarInstrumento(novoId);

      atualizar({
        instrumentoId: novoId,
        // Mantém a afinação equivalente quando ela existe no instrumento novo —
        // quem estava em meio tom abaixo espera continuar em meio tom abaixo.
        afinacaoId: afinacaoAoTrocarInstrumento(novoId, afinacaoId),
      });

      // O perfil de análise muda (janela, filtros): o grafo precisa ser refeito,
      // preservando o MediaStream para não reabrir o prompt de permissão.
      if (microfone.ativo) microfone.trocarPerfil(novo.perfil);
      reiniciarProgresso();
    },
    [instrumentoId, afinacaoId, atualizar, microfone, reiniciarProgresso],
  );

  const aoTrocarAfinacao = useCallback(
    (novaId) => {
      if (novaId === afinacaoId) return;
      atualizar({ afinacaoId: novaId });
      reiniciarProgresso();
    },
    [afinacaoId, atualizar, reiniciarProgresso],
  );

  const aoTrocarDiapasao = useCallback(
    (novoA4) => {
      atualizar({ a4: novoA4 });
      // Os alvos se deslocam; o que estava afinado no diapasão antigo não está
      // mais no novo.
      setCordasAfinadas(new Set());
    },
    [atualizar],
  );

  const aoIniciar = useCallback(
    () => microfone.iniciar(instrumento.perfil),
    [microfone, instrumento],
  );

  const cordaAlvo = useMemo(
    () => cordas.find((c) => c.id === (cordaTravada ?? leitura.corda?.id)) ?? null,
    [cordas, cordaTravada, leitura.corda],
  );

  if (microfone.estado !== ESTADO.ATIVO) {
    // Os controles só fazem sentido no estado inicial, onde escolher o
    // instrumento antes de ligar o microfone evita refazer o grafo depois.
    //
    // Em erro e enquanto se pede permissão eles saem da tela: a única ação útil
    // ali é destravar o acesso ao microfone, e oferecer seletores de afinação
    // junto dilui essa mensagem — sugere que há algo a configurar quando não há.
    const podeConfigurar = microfone.estado === ESTADO.INICIAL;

    return (
      <div className="w-full space-y-4">
        <PermissaoMicrofone estado={microfone.estado} erro={microfone.erro} aoIniciar={aoIniciar} />
        {podeConfigurar ? (
          <Controles
            instrumentoId={instrumentoId}
            afinacaoId={afinacaoId}
            a4={a4}
            aoTrocarInstrumento={aoTrocarInstrumento}
            aoTrocarAfinacao={aoTrocarAfinacao}
            aoTrocarDiapasao={aoTrocarDiapasao}
          />
        ) : null}
      </div>
    );
  }

  const semSinal = leitura.frequencia === null;
  const nota = leitura.foraDaAfinacao
    ? (leitura.nota?.nome ?? '––')
    : (leitura.corda?.nome ?? '––');
  const detalheCorda = leitura.corda
    ? `corda ${leitura.corda.numero}${leitura.travada ? ' · travada' : ''}`
    : null;

  return (
    <div className="w-full space-y-6">
      <Mostrador
        ref={mostradorRef}
        nota={referencia.tocando ? '♪' : nota}
        detalheCorda={referencia.tocando ? 'tocando referência' : detalheCorda}
        direcao={leitura.direcao}
        semSinal={semSinal || !!referencia.tocando}
        foraDaAfinacao={leitura.foraDaAfinacao}
        foraDaEscala={leitura.foraDaEscala}
        afinada={!!leitura.corda && cordasAfinadas.has(leitura.corda.id)}
      />

      <ListaCordas
        cordas={cordas}
        cordaAtiva={leitura.corda?.id ?? null}
        cordaTravada={cordaTravada}
        cordasAfinadas={cordasAfinadas}
        aoTravar={setCordaTravada}
      />

      <Controles
        instrumentoId={instrumentoId}
        afinacaoId={afinacaoId}
        a4={a4}
        aoTrocarInstrumento={aoTrocarInstrumento}
        aoTrocarAfinacao={aoTrocarAfinacao}
        aoTrocarDiapasao={aoTrocarDiapasao}
      />

      <div className="flex flex-wrap gap-2">
        <Botao
          variante="secundario"
          className="flex-1"
          disabled={!cordaAlvo}
          onPointerDown={() => referencia.tocar(cordaAlvo)}
          onPointerUp={referencia.parar}
          onPointerLeave={referencia.parar}
          onPointerCancel={referencia.parar}
        >
          {cordaAlvo ? `Ouvir ${cordaAlvo.nome}` : 'Ouvir referência'}
        </Botao>
        <Botao variante="secundario" onClick={reiniciarProgresso}>
          Recomeçar
        </Botao>
        <Botao variante="fantasma" onClick={microfone.parar}>
          Desligar
        </Botao>
      </div>

      {referencia.tocando?.oitavaAcima ? (
        <p className="text-center text-xs text-texto-fraco">
          Soando uma oitava acima — alto-falante pequeno não reproduz{' '}
          {Math.round(referencia.tocando.frequencia / 2)} Hz.
        </p>
      ) : null}

      {/* Equivalente textual do mostrador para leitor de tela (NFR-6). */}
      <p ref={anuncioRef} aria-live="polite" className="sr-only" />
    </div>
  );
}
