import test from 'node:test';
import assert from 'node:assert/strict';

import {
  A4_PADRAO,
  INSTRUMENTOS,
  buscarAfinacao,
  cordasDaAfinacao,
  freqParaMidi,
  midiParaFreq,
  nomeDaNota,
  todosOsMidisDistintos,
} from './instrumentos.js';

test('midiParaFreq ancora em A4 = 440', () => {
  assert.equal(midiParaFreq(69), 440);
  assert.ok(Math.abs(midiParaFreq(57) - 220) < 1e-9, 'A3 deve ser exatamente uma oitava abaixo');
  assert.ok(Math.abs(midiParaFreq(81) - 880) < 1e-9, 'A5 deve ser exatamente uma oitava acima');
});

test('frequências das cordas batem com os valores de referência', () => {
  // Valores tabelados a duas casas — a checagem que pega constante trocada.
  const esperados = [
    [23, 30.87, 'B0'],
    [26, 36.71, 'D1'],
    [28, 41.2, 'E1'],
    [33, 55.0, 'A1'],
    [38, 73.42, 'D2'],
    [40, 82.41, 'E2'],
    [43, 98.0, 'G2'],
    [45, 110.0, 'A2'],
    [50, 146.83, 'D3'],
    [55, 196.0, 'G3'],
    [59, 246.94, 'B3'],
    [64, 329.63, 'E4'],
  ];

  for (const [midi, freq, nome] of esperados) {
    assert.ok(
      Math.abs(midiParaFreq(midi) - freq) < 0.005,
      `MIDI ${midi} deu ${midiParaFreq(midi).toFixed(3)} Hz, esperado ${freq}`,
    );
    assert.equal(nomeDaNota(midi), nome);
  }
});

test('freqParaMidi é inverso de midiParaFreq', () => {
  for (let midi = 20; midi <= 70; midi += 1) {
    assert.ok(Math.abs(freqParaMidi(midiParaFreq(midi)) - midi) < 1e-9);
  }
});

test('grafia bemol nas afinações de meio tom abaixo (D5)', () => {
  assert.equal(nomeDaNota(39, 'bemol'), 'Eb2');
  assert.equal(nomeDaNota(39, 'sustenido'), 'D#2');

  const cordas = cordasDaAfinacao('violao', 'meio-tom-abaixo');
  assert.deepEqual(
    cordas.map((c) => c.nome),
    ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'],
  );
});

test('diapasão a 432 Hz escala todas as cordas por 432/440 (FR-12)', () => {
  const padrao = cordasDaAfinacao('violao', 'padrao', A4_PADRAO);
  const alternativo = cordasDaAfinacao('violao', 'padrao', 432);

  assert.equal(padrao.length, alternativo.length);
  for (let i = 0; i < padrao.length; i += 1) {
    const razao = alternativo[i].frequencia / padrao[i].frequencia;
    assert.ok(Math.abs(razao - 432 / 440) < 1e-12, `corda ${i} escalou por ${razao}`);
  }
});

test('numeração das cordas segue a convenção do músico', () => {
  const violao = cordasDaAfinacao('violao', 'padrao');
  assert.equal(violao[0].numero, 6, 'a mais grave do violão é a corda 6');
  assert.equal(violao[0].nome, 'E2');
  assert.equal(violao[5].numero, 1);
  assert.equal(violao[5].nome, 'E4');

  const baixo = cordasDaAfinacao('baixo-4', 'padrao');
  assert.equal(baixo[0].numero, 4, 'a mais grave do baixo de 4 é a corda 4');
  assert.equal(baixo[0].nome, 'E1');

  const baixo5 = cordasDaAfinacao('baixo-5', 'padrao');
  assert.equal(baixo5[0].numero, 5);
  assert.equal(baixo5[0].nome, 'B0');
});

test('cordas vêm sempre da mais grave para a mais aguda', () => {
  for (const instrumento of INSTRUMENTOS) {
    for (const afinacao of instrumento.afinacoes) {
      const cordas = cordasDaAfinacao(instrumento.id, afinacao.id);
      for (let i = 1; i < cordas.length; i += 1) {
        assert.ok(
          cordas[i].frequencia > cordas[i - 1].frequencia,
          `${instrumento.id}/${afinacao.id}: corda ${i} não é mais aguda que a anterior`,
        );
      }
    }
  }
});

test('todo preset tem o número de cordas do seu instrumento', () => {
  for (const instrumento of INSTRUMENTOS) {
    for (const afinacao of instrumento.afinacoes) {
      assert.equal(
        afinacao.cordas.length,
        instrumento.quantidadeCordas,
        `${instrumento.id}/${afinacao.id} tem ${afinacao.cordas.length} cordas`,
      );
    }
  }
});

test('toda corda cai dentro da faixa de busca do perfil do instrumento', () => {
  // Se um preset tiver corda fora de [fmin, fmax], o detector nunca a encontra —
  // falha silenciosa que só apareceria com o instrumento na mão.
  for (const instrumento of INSTRUMENTOS) {
    const { fmin, fmax } = instrumento.perfil;
    for (const afinacao of instrumento.afinacoes) {
      for (const corda of cordasDaAfinacao(instrumento.id, afinacao.id)) {
        assert.ok(
          corda.frequencia > fmin && corda.frequencia < fmax,
          `${instrumento.id}/${afinacao.id}: ${corda.nome} (${corda.frequencia.toFixed(2)} Hz) ` +
            `fora da faixa ${fmin}–${fmax} Hz`,
        );
      }
    }
  }
});

test('faixa de busca acomoda o diapasão nos dois extremos (415 e 466)', () => {
  for (const instrumento of INSTRUMENTOS) {
    const { fmin, fmax } = instrumento.perfil;
    for (const a4 of [415, 466]) {
      for (const afinacao of instrumento.afinacoes) {
        for (const corda of cordasDaAfinacao(instrumento.id, afinacao.id, a4)) {
          assert.ok(
            corda.frequencia > fmin && corda.frequencia < fmax,
            `${instrumento.id}/${afinacao.id} com A4=${a4}: ${corda.nome} ` +
              `(${corda.frequencia.toFixed(2)} Hz) fora de ${fmin}–${fmax} Hz`,
          );
        }
      }
    }
  }
});

test('todosOsMidisDistintos cobre os três instrumentos sem repetição', () => {
  const midis = todosOsMidisDistintos();
  assert.equal(new Set(midis).size, midis.length, 'há repetição na lista');
  assert.equal(midis[0], 23, 'a mais grave é o B0 do baixo de 5');
  assert.equal(midis[midis.length - 1], 64, 'a mais aguda é o E4 do violão');
});

test('buscar afinação inexistente devolve null em vez de estourar', () => {
  assert.equal(buscarAfinacao('violao', 'nao-existe'), null);
  assert.equal(buscarAfinacao('trombone', 'padrao'), null);
  assert.deepEqual(cordasDaAfinacao('trombone', 'padrao'), []);
});
