'use client';

/**
 * Cordas da afinação atual (FR-9, FR-10, FR-15).
 *
 * A grade é fluida de propósito: são 4, 5 ou 6 cordas conforme o instrumento, e
 * assumir seis colunas quebraria o baixo. Ordem da mais grave para a mais aguda,
 * como a lista é lida por quem toca.
 *
 * Tocar numa pastilha trava a corda (FR-10) — o escape para quando a detecção
 * automática oscila entre cordas vizinhas.
 */

export default function ListaCordas({ cordas, cordaAtiva, cordaTravada, cordasAfinadas, aoTravar }) {
  return (
    <ul
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${cordas.length}, minmax(0, 1fr))` }}
    >
      {cordas.map((corda) => {
        const afinada = cordasAfinadas.has(corda.id);
        const ativa = corda.id === cordaAtiva;
        const travada = corda.id === cordaTravada;

        const estilo = travada
          ? 'border-texto bg-texto/10 text-texto'
          : afinada
            ? 'border-afinado bg-afinado/15 text-afinado'
            : ativa
              ? 'border-proximo bg-proximo/10 text-proximo'
              : 'border-borda bg-superficie text-texto-fraco';

        // O estado não pode depender só de cor (NFR-6): daí o texto abaixo do
        // nome dizer em palavras o que a cor está dizendo.
        const situacao = travada ? 'travada' : afinada ? 'afinada' : ativa ? 'ouvindo' : '';

        return (
          <li key={corda.id}>
            <button
              type="button"
              onClick={() => aoTravar(travada ? null : corda.id)}
              aria-pressed={travada}
              aria-label={
                `Corda ${corda.numero}, ${corda.nome}` +
                (situacao ? `, ${situacao}` : '') +
                (travada ? '. Toque para destravar' : '. Toque para travar nesta corda')
              }
              className={`flex min-h-16 w-full flex-col items-center justify-center rounded-xl border transition ${estilo}`}
            >
              <span className="font-mono text-base font-semibold">{corda.nome}</span>
              <span className="mt-0.5 text-[10px] tracking-wide text-texto-fraco">
                {situacao || corda.numero}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
