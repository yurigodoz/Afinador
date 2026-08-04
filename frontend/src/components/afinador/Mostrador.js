'use client';

/**
 * Mostrador de desvio (FR-7, NFR-6, NFR-7).
 *
 * O ponteiro e o número de cents são escritos por `ref`, dentro do laço de
 * análise — não passam por estado do React (decisions.md D6). O que vem por
 * props é só o que muda de forma discreta: nome da nota, corda, estado.
 *
 * Acessibilidade: cor e posição do ponteiro nunca são a única informação. O
 * rótulo textual ("aperte" / "afrouxe" / "afinado") e o número em cents dizem o
 * mesmo, e a região `aria-live` fica no componente pai (NFR-6).
 */

import { forwardRef, useImperativeHandle, useRef } from 'react';

/** Meia-abertura do arco, em cents. Além disso o ponteiro satura nas pontas. */
const ESCALA_CENTS = 50;

/** Tolerância de afinado, em cents — a zona verde no centro. */
const ZONA_AFINADO = 5;

const LARGURA = 320;
const ALTURA = 172;
const CENTRO_X = LARGURA / 2;
const CENTRO_Y = 150;
const RAIO = 118;

/** Converte cents em ângulo, em graus, com −50 à esquerda e +50 à direita. */
function centsParaAngulo(cents) {
  const limitado = Math.max(-ESCALA_CENTS, Math.min(ESCALA_CENTS, cents));
  return (limitado / ESCALA_CENTS) * 78;
}

function pontoNoArco(anguloGraus, raio) {
  const rad = ((anguloGraus - 90) * Math.PI) / 180;
  return { x: CENTRO_X + raio * Math.cos(rad), y: CENTRO_Y + raio * Math.sin(rad) };
}

function arco(deCents, ateCents, raio) {
  const inicio = pontoNoArco(centsParaAngulo(deCents), raio);
  const fim = pontoNoArco(centsParaAngulo(ateCents), raio);
  return `M ${inicio.x.toFixed(2)} ${inicio.y.toFixed(2)} A ${raio} ${raio} 0 0 1 ${fim.x.toFixed(2)} ${fim.y.toFixed(2)}`;
}

const Mostrador = forwardRef(function Mostrador(
  { nota, detalheCorda, direcao, semSinal, foraDaAfinacao, foraDaEscala, afinada },
  ref,
) {
  const ponteiroRef = useRef(null);
  const centsRef = useRef(null);

  // O laço de análise chama isto a cada frame. Nada aqui dispara render.
  useImperativeHandle(ref, () => ({
    atualizar(cents) {
      if (ponteiroRef.current) {
        const angulo = cents === null ? 0 : centsParaAngulo(cents);
        ponteiroRef.current.setAttribute('transform', `rotate(${angulo.toFixed(2)} ${CENTRO_X} ${CENTRO_Y})`);
        ponteiroRef.current.style.opacity = cents === null ? '0.25' : '1';
      }
      if (centsRef.current) {
        if (cents === null) {
          centsRef.current.textContent = '—';
        } else {
          const arredondado = Math.round(cents);
          const sinal = arredondado > 0 ? '+' : '';
          centsRef.current.textContent = `${sinal}${arredondado}`;
        }
      }
    },
  }));

  const corDoEstado = afinada
    ? 'text-afinado'
    : semSinal || foraDaAfinacao
      ? 'text-texto-fraco'
      : 'text-proximo';

  // Um ponteiro cravado na ponta da escala é indistinguível de um ponteiro
  // travado. Quando o desvio passa de ±50 cents, o texto diz isso em palavras.
  const rotulo = semSinal
    ? 'toque uma corda'
    : foraDaAfinacao
      ? 'fora desta afinação'
      : afinada
        ? 'afinado'
        : foraDaEscala
          ? `${direcao} muito`
          : direcao;

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        className="w-full max-w-[320px]"
        role="img"
        aria-hidden="true"
      >
        {/* Arco de fundo, de −50 a +50 cents */}
        <path
          d={arco(-ESCALA_CENTS, ESCALA_CENTS, RAIO)}
          fill="none"
          stroke="currentColor"
          className="text-inativo"
          strokeWidth="6"
          strokeLinecap="round"
        />

        {/* Zona de afinado: estreita de propósito — ±5 cents em ±50 de escala */}
        <path
          d={arco(-ZONA_AFINADO, ZONA_AFINADO, RAIO)}
          fill="none"
          stroke="currentColor"
          className={afinada ? 'text-afinado' : 'text-afinado/40'}
          strokeWidth="10"
          strokeLinecap="round"
        />

        {/* Marcas de referência */}
        {[-50, -25, 0, 25, 50].map((marca) => {
          const externo = pontoNoArco(centsParaAngulo(marca), RAIO + 10);
          const interno = pontoNoArco(centsParaAngulo(marca), RAIO - 2);
          return (
            <line
              key={marca}
              x1={interno.x}
              y1={interno.y}
              x2={externo.x}
              y2={externo.y}
              stroke="currentColor"
              className="text-borda"
              strokeWidth={marca === 0 ? 3 : 1.5}
            />
          );
        })}

        <g ref={ponteiroRef} style={{ transition: 'transform 60ms linear' }}>
          <line
            x1={CENTRO_X}
            y1={CENTRO_Y}
            x2={CENTRO_X}
            y2={CENTRO_Y - RAIO + 14}
            stroke="currentColor"
            className={corDoEstado}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx={CENTRO_X} cy={CENTRO_Y} r="6" fill="currentColor" className={corDoEstado} />
        </g>
      </svg>

      <div className="-mt-6 flex flex-col items-center">
        <span
          className={`font-mono text-6xl leading-none font-semibold tabular-nums ${corDoEstado}`}
        >
          {nota ?? '––'}
        </span>

        {detalheCorda ? (
          <span className="mt-2 text-sm text-texto-fraco">{detalheCorda}</span>
        ) : null}

        <div className="mt-3 flex items-baseline gap-2">
          <span ref={centsRef} className="font-mono text-lg tabular-nums text-texto">
            —
          </span>
          <span className="text-sm text-texto-fraco">cents</span>
        </div>

        <span className={`mt-1 text-sm font-medium ${corDoEstado}`}>{rotulo}</span>
      </div>
    </div>
  );
});

export default Mostrador;
