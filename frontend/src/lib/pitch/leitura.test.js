import test from 'node:test';
import assert from 'node:assert/strict';

import { cordasDaAfinacao, midiParaFreq } from '../instrumentos.js';
import { LEITURA_VAZIA, descreverLeitura, montarLeitura } from './leitura.js';

const A4 = 440;
const violao = cordasDaAfinacao('violao', 'padrao');
const baixo5 = cordasDaAfinacao('baixo-5', 'padrao');

/** Desloca uma frequência por um número de cents. */
function desviar(freq, cents) {
  return freq * 2 ** (cents / 1200);
}

test('sem frequência devolve a leitura vazia', () => {
  assert.deepEqual(montarLeitura({ frequencia: null, cordas: violao, a4: A4 }), LEITURA_VAZIA);
  assert.deepEqual(montarLeitura({ frequencia: 0, cordas: violao, a4: A4 }), LEITURA_VAZIA);
  assert.deepEqual(montarLeitura({ frequencia: NaN, cordas: violao, a4: A4 }), LEITURA_VAZIA);
});

test('escolhe a corda mais próxima e mede o desvio (FR-5, FR-7)', () => {
  const leitura = montarLeitura({
    frequencia: desviar(midiParaFreq(45), -12), // A2 doze cents abaixo
    clarity: 0.98,
    cordas: violao,
    a4: A4,
  });

  assert.equal(leitura.corda.nome, 'A2');
  assert.equal(leitura.corda.numero, 5);
  assert.ok(Math.abs(leitura.cents + 12) < 0.001);
  assert.equal(leitura.direcao, 'aperte');
  assert.equal(leitura.foraDaAfinacao, false);
});

test('acima do alvo manda afrouxar', () => {
  const leitura = montarLeitura({
    frequencia: desviar(midiParaFreq(64), 20),
    cordas: violao,
    a4: A4,
  });
  assert.equal(leitura.corda.nome, 'E4');
  assert.equal(leitura.direcao, 'afrouxe');
});

test('dentro de 5 cents está afinada', () => {
  for (const desvio of [0, 4.9, -4.9]) {
    const leitura = montarLeitura({
      frequencia: desviar(midiParaFreq(50), desvio),
      cordas: violao,
      a4: A4,
    });
    assert.equal(leitura.direcao, 'afinado', `desvio de ${desvio} cents devia contar como afinado`);
  }
});

test('longe de qualquer corda mostra a nota cromática (FR-6)', () => {
  // Um tom abaixo do E2: 200 cents do alvo mais próximo.
  const leitura = montarLeitura({
    frequencia: midiParaFreq(38),
    cordas: violao,
    a4: A4,
  });

  assert.equal(leitura.foraDaAfinacao, true);
  assert.equal(leitura.corda, null, 'não pode forçar uma corda como alvo');
  assert.equal(leitura.cents, null);
  assert.equal(leitura.nota.nome, 'D2');
});

test('corda travada vence a proximidade (FR-10)', () => {
  // Cenário 2 da spec: corda 6 (E2) afrouxada quase até o D2, portanto muito
  // mais perto do D3 de outra corda... o ponto é que, travada, o alvo não muda.
  const cordaSeis = violao[0];
  const frequencia = midiParaFreq(38); // D2, 200 cents abaixo do E2

  const semTrava = montarLeitura({ frequencia, cordas: violao, a4: A4 });
  assert.equal(semTrava.foraDaAfinacao, true, 'sem trava, é nota fora da afinação');

  const comTrava = montarLeitura({
    frequencia,
    cordas: violao,
    cordaTravada: cordaSeis.id,
    a4: A4,
  });

  assert.equal(comTrava.corda.nome, 'E2');
  assert.equal(comTrava.travada, true);
  assert.equal(comTrava.foraDaAfinacao, false, 'travada, a distância não descaracteriza o alvo');
  assert.ok(Math.abs(comTrava.cents + 200) < 0.001);
  assert.equal(comTrava.direcao, 'aperte', 'tem de guiar o usuário de volta ao E2');
});

test('trava em corda inexistente cai no comportamento automático', () => {
  const leitura = montarLeitura({
    frequencia: midiParaFreq(45),
    cordas: violao,
    cordaTravada: 'corda-que-nao-existe',
    a4: A4,
  });
  assert.equal(leitura.corda.nome, 'A2');
  assert.equal(leitura.travada, false);
});

test('oitavas próximas não confundem o alvo no baixo de 5', () => {
  // O baixo de 5 tem B0, E1, A1, D2, G2. Um D2 tocado não pode acender o G2.
  const leitura = montarLeitura({ frequencia: midiParaFreq(38), cordas: baixo5, a4: A4 });
  assert.equal(leitura.corda.nome, 'D2');
  assert.equal(leitura.corda.numero, 2);
});

test('B0 do baixo de 5 é reconhecido como corda 5', () => {
  const leitura = montarLeitura({ frequencia: midiParaFreq(23), cordas: baixo5, a4: A4 });
  assert.equal(leitura.corda.nome, 'B0');
  assert.equal(leitura.corda.numero, 5);
});

test('o diapasão desloca os alvos (FR-12)', () => {
  // Um violão afinado no diapasão 440 lido contra alvos de 432: cada corda
  // aparece ~32 cents acima, que é a distância entre os dois diapasões.
  const esperado = 1200 * Math.log2(440 / 432); // ≈ 31,8 cents
  const cordas432 = cordasDaAfinacao('violao', 'padrao', 432);

  for (const corda440 of cordasDaAfinacao('violao', 'padrao', 440)) {
    const leitura = montarLeitura({ frequencia: corda440.frequencia, cordas: cordas432, a4: 432 });

    assert.equal(leitura.corda.nome, corda440.nome, 'a corda reconhecida deve ser a mesma');
    assert.ok(
      Math.abs(leitura.cents - esperado) < 0.001,
      `${corda440.nome}: ${leitura.cents.toFixed(2)} cents, esperado ${esperado.toFixed(2)}`,
    );
    assert.equal(leitura.direcao, 'afrouxe');
  }
});

test('desvio além da escala do mostrador é sinalizado (bug do −1000 cents)', () => {
  // Regressão de um bug encontrado por Yuri em teste com violão: tocando o E2 e
  // travando no D3, o mostrador acusava −1000 cents com o ponteiro cravado à
  // esquerda. A causa raiz era a retenção do FR-4 (leitura antiga comparada com
  // alvo novo) e foi corrigida em `useDeteccaoAltura`. O que sobra aqui é o caso
  // legítimo: corda de fato muito desafinada, travada de propósito.
  //
  // Um ponteiro na ponta da escala é indistinguível de um ponteiro travado, daí
  // `foraDaEscala` — para a interface poder dizer em palavras.
  const cordaQuatro = violao.find((c) => c.nome === 'D3');

  const leitura = montarLeitura({
    frequencia: midiParaFreq(40), // E2 soando
    cordas: violao,
    cordaTravada: cordaQuatro.id,
    a4: A4,
  });

  assert.ok(Math.abs(leitura.cents + 1000) < 1, `deu ${leitura.cents} cents`);
  assert.equal(leitura.foraDaEscala, true);
  assert.equal(leitura.direcao, 'aperte');
  assert.match(descreverLeitura(leitura), /muito 1000 cents abaixo/);
});

test('dentro da escala não é marcado como fora dela', () => {
  for (const desvio of [0, 30, -49.9]) {
    const leitura = montarLeitura({
      frequencia: desviar(midiParaFreq(45), desvio),
      cordas: violao,
      a4: A4,
    });
    assert.equal(leitura.foraDaEscala, false, `${desvio} cents não está fora da escala`);
  }

  const alem = montarLeitura({
    frequencia: desviar(midiParaFreq(45), 60),
    cordas: violao,
    a4: A4,
  });
  assert.equal(alem.foraDaEscala, true);
});

test('descrição para leitor de tela cobre os estados (NFR-6)', () => {
  assert.equal(descreverLeitura(LEITURA_VAZIA), 'Aguardando som.');
  assert.equal(descreverLeitura(null), 'Aguardando som.');

  const afinada = montarLeitura({ frequencia: midiParaFreq(45), cordas: violao, a4: A4 });
  assert.equal(descreverLeitura(afinada), 'Corda 5, A2, afinada.');

  const baixa = montarLeitura({
    frequencia: desviar(midiParaFreq(45), -12),
    cordas: violao,
    a4: A4,
  });
  assert.equal(descreverLeitura(baixa), 'Corda 5, A2, 12 cents abaixo, aperte.');

  const alta = montarLeitura({
    frequencia: desviar(midiParaFreq(45), 30),
    cordas: violao,
    a4: A4,
  });
  assert.equal(descreverLeitura(alta), 'Corda 5, A2, 30 cents acima, afrouxe.');

  const fora = montarLeitura({ frequencia: midiParaFreq(38), cordas: violao, a4: A4 });
  assert.equal(descreverLeitura(fora), 'Nota D2, fora desta afinação.');
});

test('a descrição nunca diz "-0 cents"', () => {
  // Arredondar −0,4 dá −0, e "0 cents abaixo" seria constrangedor num leitor de
  // tela. Dentro da tolerância o texto tem de ser "afinada".
  const leitura = montarLeitura({
    frequencia: desviar(midiParaFreq(45), -0.4),
    cordas: violao,
    a4: A4,
  });
  const frase = descreverLeitura(leitura);
  assert.ok(!frase.includes('-0'), frase);
  assert.equal(frase, 'Corda 5, A2, afinada.');
});
