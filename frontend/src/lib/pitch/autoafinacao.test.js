/**
 * Regressão do bug de autoafinação.
 *
 * Sintoma, filmado por Yuri em 2026-08-04: bastava acionar o tom de referência
 * de cada corda, sem tocar o violão, para as seis serem marcadas como afinadas.
 * O tom sai na frequência-alvo exata — se a detecção o mede, dá 0 cents e o
 * afinador confirma a corda com base no som que ele mesmo emitiu.
 *
 * A primeira tentativa de correção bloqueava a marcação por 600 ms após o tom.
 * Não funcionou, e o motivo é aritmético: a confirmação de afinado leva 700 ms.
 * A cauda do tom seguia alimentando leituras de 0 cent, a confirmação completava
 * aos 700 ms e a proteção já tinha expirado aos 600.
 *
 * Este arquivo trava a relação entre as duas janelas. Não é teste de interface —
 * é teste de que os números continuam compatíveis entre si.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { criarConfirmadorAfinado } from './smoothing.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Lê uma constante numérica declarada em um módulo, sem importá-lo. */
function lerConstante(caminhoRelativo, nome) {
  const codigo = readFileSync(join(RAIZ, caminhoRelativo), 'utf8');
  const achado = codigo.match(new RegExp(`const\\s+${nome}\\s*=\\s*(\\d+)`));
  assert.ok(achado, `não achei a constante ${nome} em ${caminhoRelativo}`);
  return Number(achado[1]);
}

test('a acomodação do tom dura mais que a confirmação de afinado', () => {
  // `useTomReferencia` é um hook (usa React), então não dá para importá-lo aqui
  // sem quebrar a regra de pureza de lib/. A constante é lida do arquivo.
  const acomodacaoMs = lerConstante('hooks/useTomReferencia.js', 'ACOMODACAO_MS');

  // O padrão de `criarConfirmadorAfinado`, verificado abaixo por comportamento.
  const confirmacaoMs = 700;

  assert.ok(
    acomodacaoMs > confirmacaoMs,
    `acomodação de ${acomodacaoMs} ms não cobre a confirmação de ${confirmacaoMs} ms — ` +
      'o eco do tom de referência completaria a confirmação sozinho',
  );

  // Margem para o eco não completar a confirmação logo depois de a detecção
  // voltar. Ao retomar, o laço é remontado e o confirmador nasce zerado, então
  // seriam precisos mais 700 ms contínuos de eco — mas a folga documenta a
  // intenção.
  assert.ok(
    acomodacaoMs - confirmacaoMs >= 100,
    `margem de apenas ${acomodacaoMs - confirmacaoMs} ms entre as duas janelas`,
  );
});

test('o confirmador realmente exige 700 ms por padrão', () => {
  // Se alguém mudar esse padrão, o teste acima passa a comparar com um número
  // errado. Aqui o valor é verificado por comportamento, não por leitura.
  const confirmador = criarConfirmadorAfinado();

  assert.equal(confirmador.processar(0, 'corda-1', 0), false);
  assert.equal(confirmador.processar(0, 'corda-1', 699), false);
  assert.equal(confirmador.processar(0, 'corda-1', 700), true);
});

test('um tom perfeito e contínuo confirma em 700 ms — daí a necessidade de suspender', () => {
  // Demonstra o mecanismo do bug: o tom de referência é exatamente o alvo, então
  // alimenta 0 cents indefinidamente. Sem suspender a detecção, a confirmação é
  // inevitável — não há limiar de tolerância que a evite, porque o desvio é zero.
  const confirmador = criarConfirmadorAfinado();

  // Quadros a ~30 Hz, como no laço real. O passo de 33 ms não cai exatamente em
  // 700: o quadro anterior é 693 e o seguinte, 726 — é nele que confirma.
  let afinada = false;
  let quadros = 0;
  for (let ms = 0; ms <= 800; ms += 33) {
    afinada = confirmador.processar(0, 'corda-1', ms);
    quadros += 1;
    if (afinada) break;
  }

  assert.equal(
    afinada,
    true,
    'o tom de referência confirma a corda sozinho — por isso a detecção precisa ficar suspensa',
  );
  assert.ok(
    quadros <= 24,
    `foram ${quadros} quadros até confirmar — menos de um segundo de eco basta`,
  );
});
