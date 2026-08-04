'use client';

/**
 * Painel de verificação da Wave 1 — **temporário**.
 *
 * Existe para tornar o Wave Checkpoint 1 verificável no navegador antes de haver
 * qualquer detecção de altura: liga e desliga o microfone, mostra o nível ao
 * vivo e troca o perfil de análise sem novo prompt de permissão. Na Wave 2 este
 * arquivo dá lugar ao `Afinador.js` com mostrador e lista de cordas.
 */

import { useCallback, useRef, useState } from 'react';

import PermissaoMicrofone from '@/components/afinador/PermissaoMicrofone';
import Botao from '@/components/ui/Botao';
import { ESTADO, useMicrofone } from '@/hooks/useMicrofone';
import { useNivelDeSinal } from '@/hooks/useNivelDeSinal';
import { INSTRUMENTOS, fatorDeDecimacao, tamanhoDeJanela } from '@/lib/instrumentos';

/** −60 dBFS (silêncio) a 0 dBFS (saturado) mapeados em 0…100%. */
function dbParaPercentual(db) {
  if (!Number.isFinite(db)) return 0;
  return Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
}

export default function PainelDeCaptura() {
  const [instrumentoId, setInstrumentoId] = useState(INSTRUMENTOS[0].id);
  const { estado, erro, ativo, iniciar, parar, trocarPerfil, obterAnalisador, obterSampleRate } =
    useMicrofone();

  const barraRef = useRef(null);
  const numeroRef = useRef(null);

  const instrumento = INSTRUMENTOS.find((i) => i.id === instrumentoId);

  // Escreve direto no DOM: é valor contínuo a 30 Hz (decisions.md D6).
  const aoAtualizarNivel = useCallback((db) => {
    if (barraRef.current) barraRef.current.style.width = `${dbParaPercentual(db)}%`;
    if (numeroRef.current) {
      numeroRef.current.textContent = Number.isFinite(db) ? `${db.toFixed(1)} dBFS` : '— dBFS';
    }
  }, []);

  useNivelDeSinal({ ativo, obterAnalisador, aoAtualizar: aoAtualizarNivel });

  const aoIniciar = useCallback(() => iniciar(instrumento.perfil), [iniciar, instrumento]);

  const aoTrocarInstrumento = useCallback(
    (id) => {
      setInstrumentoId(id);
      const novo = INSTRUMENTOS.find((i) => i.id === id);
      // Só refaz o grafo se já houver captura; senão a troca vale para o próximo
      // `iniciar`. O ponto do teste é que isto não pode reabrir o prompt.
      if (ativo) trocarPerfil(novo.perfil);
    },
    [ativo, trocarPerfil],
  );

  if (estado !== ESTADO.ATIVO) {
    return <PermissaoMicrofone estado={estado} erro={erro} aoIniciar={aoIniciar} />;
  }

  const { perfil } = instrumento;
  const taxa = obterSampleRate();
  const janela = taxa ? tamanhoDeJanela(perfil, taxa) : null;
  const fator = taxa ? fatorDeDecimacao(perfil, taxa) : null;

  return (
    <div className="w-full space-y-6">
      <div className="rounded-2xl border border-borda bg-superficie p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-texto-fraco">Nível de entrada</span>
          <span ref={numeroRef} className="font-mono text-sm tabular-nums text-texto">
            — dBFS
          </span>
        </div>

        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-inativo/40">
          <div ref={barraRef} className="h-full w-0 rounded-full bg-afinado transition-none" />
        </div>

        <p className="mt-3 text-xs text-texto-fraco">
          Toque uma corda: a barra tem de reagir. Silêncio fica perto de −60 dBFS.
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm text-texto-fraco">Perfil de análise</p>
        <div className="flex flex-wrap gap-2">
          {INSTRUMENTOS.map((item) => (
            <Botao
              key={item.id}
              variante={item.id === instrumentoId ? 'primario' : 'secundario'}
              onClick={() => aoTrocarInstrumento(item.id)}
            >
              {item.nome}
            </Botao>
          ))}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl border border-borda bg-superficie p-5 font-mono text-xs text-texto-fraco">
        <dt>Janela</dt>
        <dd className="text-right text-texto">
          {janela ? `${janela} am (${perfil.duracaoJanelaMs} ms)` : '—'}
        </dd>
        <dt>Faixa de busca</dt>
        <dd className="text-right text-texto">
          {perfil.fmin}–{perfil.fmax} Hz
        </dd>
        <dt>Filtros</dt>
        <dd className="text-right text-texto">
          {perfil.highpassHz}–{perfil.lowpassHz} Hz
          {perfil.notches.length > 0 ? ` + notch ${perfil.notches.map((n) => n.frequencia).join('/')}` : ''}
        </dd>
        <dt>Decimação</dt>
        <dd className="text-right text-texto">
          {fator ? `÷${fator} → ${Math.round(taxa / fator)} Hz` : '—'}
        </dd>
        <dt>Taxa do dispositivo</dt>
        <dd className="text-right text-texto">{taxa ?? '—'} Hz</dd>
      </dl>

      <Botao variante="secundario" className="w-full" onClick={parar}>
        Desligar o microfone
      </Botao>

      <p className="text-center text-xs text-texto-fraco">
        Ao desligar, o indicador de gravação do navegador deve apagar em até 1 segundo.
      </p>
    </div>
  );
}
