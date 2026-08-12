'use client';

/**
 * Orquestrador da tela do afinador (Tasks 6 a 9).
 *
 * Detém o estado da §8 do design e compõe permissão, mostrador, lista de cordas
 * e controles.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import ConviteInstalacao from '@/components/afinador/ConviteInstalacao';
import Controles from '@/components/afinador/Controles';
import ListaCordas from '@/components/afinador/ListaCordas';
import Mostrador from '@/components/afinador/Mostrador';
import PermissaoMicrofone from '@/components/afinador/PermissaoMicrofone';
import Botao from '@/components/ui/Botao';
import { useDeteccaoAltura } from '@/hooks/useDeteccaoAltura';
import { useInstalacao } from '@/hooks/useInstalacao';
import { ESTADO, useMicrofone } from '@/hooks/useMicrofone';
import { usePreferencias } from '@/hooks/usePreferencias';
import { useTelaAcesa } from '@/hooks/useTelaAcesa';
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

  const referencia = useTomReferencia();

  // Encerrar a captura encerra o tom de referência junto. Sem isto, desligar o
  // microfone com o tom soando deixava o som tocando na tela inicial — e o mesmo
  // aconteceria no desligamento automático por aba oculta (FR-14), que é pior:
  // som saindo de um app que o usuário nem está vendo.
  const microfone = useMicrofone({ aoParar: referencia.parar });

  // Afinar demora mais que o apagamento automático da tela, e as mãos estão no
  // instrumento — tocar na tela para reacender é o que não dá para fazer.
  useTelaAcesa(microfone.ativo);

  const instalacao = useInstalacao();
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
    // O tom de referência sai pelo alto-falante e volta pelo microfone na
    // frequência-alvo exata — se medido, dá 0 cents e o afinador confirma a
    // corda com base no próprio som (FR-13).
    //
    // `silenciando` cobre o tom **e a cauda dele**. A suspensão precisa durar
    // mais que os 700 ms de confirmação de afinado; do contrário o eco completa
    // a confirmação sozinho. Ao voltar, o laço é remontado do zero, então o
    // temporizador recomeça — nenhuma leitura do tom sobrevive à retomada.
    ativo: microfone.ativo && !referencia.silenciando,
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

  /**
   * Ligar o microfone sempre começa uma sessão limpa.
   *
   * Sem isto, desligar e ligar de novo trazia de volta as cordas marcadas como
   * afinadas e a corda travada da sessão anterior — o afinador afirmando algo
   * sobre um instrumento que talvez nem seja o mesmo, sem ter ouvido nada desde
   * então. Vale também para quando a captura cai sozinha por aba oculta (FR-14).
   *
   * O que **não** é zerado: instrumento, afinação e diapasão. Esses são
   * preferências e existem justamente para sobreviver entre sessões (FR-11,
   * FR-12) — o que se perde é o progresso, não a configuração.
   */
  const aoIniciar = useCallback(() => {
    reiniciarProgresso();
    return microfone.iniciar(instrumento.perfil);
  }, [microfone, instrumento, reiniciarProgresso]);

  const cordaAlvo = useMemo(
    () => cordas.find((c) => c.id === (cordaTravada ?? leitura.corda?.id)) ?? null,
    [cordas, cordaTravada, leitura.corda],
  );

  /**
   * Selecionar outra corda com o tom de referência soando.
   *
   * O oscilador não fica sabendo que o alvo mudou — continuaria tocando a nota
   * anterior enquanto a tela mostra outra, que é a pior combinação possível numa
   * ferramenta de referência: o usuário confia no ouvido e afina para a nota
   * errada. Então o tom acompanha a seleção.
   *
   * Feito no manipulador do toque, e não num efeito: efeito que chama `setState`
   * gera render em cascata, e aqui a causa é literalmente um clique.
   */
  const aoTravar = useCallback(
    (id) => {
      setCordaTravada(id);
      if (!referencia.tocando) return;

      const nova = id ? cordas.find((c) => c.id === id) : null;
      if (nova) referencia.tocar(nova);
      else referencia.parar();
    },
    [cordas, referencia],
  );

  /*
   * O convite flutua no rodapé e aparece em qualquer tela.
   *
   * Sem espaçamento extra no conteúdo: ele sobrepõe o que estiver embaixo, e o
   * usuário preferiu assim. É temporário — some ao instalar ou ao dispensar — e
   * a tela de afinação continua rolável se algo ficar coberto.
   */
  const convite = instalacao.convidar ? (
    <ConviteInstalacao
      manual={instalacao.manual}
      aoInstalar={instalacao.instalar}
      aoDispensar={instalacao.dispensar}
    />
  ) : null;

  if (microfone.estado !== ESTADO.ATIVO) {
    /*
     * A tela inicial tem uma função só: começar a afinar.
     *
     * Instrumento, afinação e diapasão ficam apenas na tela de afinação. Uma
     * versão anterior os mostrava aqui também, com o argumento de que escolher
     * antes evitaria refazer o grafo de áudio — mas refazer é barato e já
     * acontece sem reabrir a permissão, então era otimização de algo que não
     * custava nada, paga com um bloco a mais numa tela que precisa ser direta.
     *
     * As preferências persistem entre sessões: quem afina baixo abre já em
     * baixo, sem precisar escolher nada antes de começar.
     */
    return (
      <div className="w-full space-y-4">
        <PermissaoMicrofone estado={microfone.estado} erro={microfone.erro} aoIniciar={aoIniciar} />
        {convite}
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
        aoTravar={aoTravar}
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
          variante={referencia.tocando ? 'primario' : 'secundario'}
          className="flex-1"
          disabled={!cordaAlvo}
          aria-pressed={!!referencia.tocando}
          onClick={() => referencia.alternar(cordaAlvo)}
        >
          {referencia.tocando
            ? `Parar ${cordaAlvo?.nome ?? 'som'}`
            : cordaAlvo
              ? `Ouvir ${cordaAlvo.nome}`
              : 'Ouvir referência'}
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

      {convite}
    </div>
  );
}
