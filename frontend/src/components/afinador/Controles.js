'use client';

/**
 * Instrumento, afinação e diapasão (FR-0, FR-11, FR-12).
 *
 * Ficam recolhidos por padrão: o caso comum é abrir e afinar, sem mexer em nada.
 * Deixar três seletores permanentes na tela roubaria espaço do mostrador, que é
 * o elemento que manda na composição (NFR-7), e atrapalharia o "cabe sem
 * rolagem" do FR-15 — ainda mais com seis cordas na lista.
 */

import { useId, useState } from 'react';

import Botao from '@/components/ui/Botao';
import { A4_MAX, A4_MIN, A4_PADRAO, INSTRUMENTOS, buscarInstrumento } from '@/lib/instrumentos';

export default function Controles({
  instrumentoId,
  afinacaoId,
  a4,
  aoTrocarInstrumento,
  aoTrocarAfinacao,
  aoTrocarDiapasao,
}) {
  const [aberto, setAberto] = useState(false);
  const idPainel = useId();

  const instrumento = buscarInstrumento(instrumentoId) ?? INSTRUMENTOS[0];
  const afinacao = instrumento.afinacoes.find((a) => a.id === afinacaoId);

  return (
    <section className="rounded-2xl border border-borda bg-superficie">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-controls={idPainel}
        className="flex min-h-12 w-full items-center justify-between px-4 text-left"
      >
        <span className="text-sm text-texto">
          {instrumento.nome} · {afinacao?.nome ?? '—'}
          {a4 !== A4_PADRAO ? ` · A4 ${a4} Hz` : ''}
        </span>
        <span aria-hidden="true" className="text-texto-fraco">
          {aberto ? '▴' : '▾'}
        </span>
      </button>

      {aberto ? (
        <div id={idPainel} className="space-y-5 border-t border-borda px-4 py-4">
          <fieldset>
            <legend className="mb-2 text-xs tracking-wide text-texto-fraco">Instrumento</legend>
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
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-xs tracking-wide text-texto-fraco">Afinação</legend>
            <div className="flex flex-wrap gap-2">
              {instrumento.afinacoes.map((item) => (
                <Botao
                  key={item.id}
                  variante={item.id === afinacaoId ? 'primario' : 'secundario'}
                  onClick={() => aoTrocarAfinacao(item.id)}
                >
                  {item.nome}
                </Botao>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-xs tracking-wide text-texto-fraco">
              Diapasão (referência do A4)
            </legend>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={A4_MIN}
                max={A4_MAX}
                step={1}
                value={a4}
                onChange={(e) => aoTrocarDiapasao(Number(e.target.value))}
                aria-label={`Diapasão em ${a4} hertz`}
                className="h-2 flex-1 accent-afinado"
              />
              <span className="w-20 text-right font-mono text-sm tabular-nums text-texto">
                {a4} Hz
              </span>
            </div>
            {a4 !== A4_PADRAO ? (
              <Botao
                variante="fantasma"
                className="mt-2 px-0"
                onClick={() => aoTrocarDiapasao(A4_PADRAO)}
              >
                Voltar para 440 Hz
              </Botao>
            ) : null}
          </fieldset>
        </div>
      ) : null}
    </section>
  );
}
