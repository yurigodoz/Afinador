import test from 'node:test';
import assert from 'node:assert/strict';

import { cordasDaAfinacao } from '../instrumentos.js';
import { LIMITE_OITAVA_ACIMA_HZ, frequenciaAudivel } from './referencia.js';

test('alvos audíveis saem na própria frequência', () => {
  for (const corda of cordasDaAfinacao('violao', 'padrao')) {
    const { frequencia, oitavaAcima } = frequenciaAudivel(corda.frequencia);
    assert.equal(oitavaAcima, false, `${corda.nome} não devia subir de oitava`);
    assert.equal(frequencia, corda.frequencia);
  }
});

test('cordas graves do baixo sobem uma oitava', () => {
  // Alto-falante de celular não entrega 30–40 Hz: o B0 sairia inaudível ou como
  // chiado, e o usuário concluiria que o afinador está quebrado.
  const graves = cordasDaAfinacao('baixo-5', 'padrao').filter(
    (c) => c.frequencia < LIMITE_OITAVA_ACIMA_HZ,
  );

  assert.ok(graves.length >= 2, 'o baixo de 5 tem pelo menos B0 e E1 abaixo do limite');

  for (const corda of graves) {
    const { frequencia, oitavaAcima } = frequenciaAudivel(corda.frequencia);
    assert.equal(oitavaAcima, true, `${corda.nome} devia subir de oitava`);
    assert.ok(Math.abs(frequencia - corda.frequencia * 2) < 1e-9);
    assert.ok(frequencia >= LIMITE_OITAVA_ACIMA_HZ, `${corda.nome} continuou grave demais`);
  }
});

test('a subida é exatamente uma oitava, não um valor arbitrário', () => {
  // Se não for oitava exata, o tom deixa de servir como referência de afinação.
  const { frequencia } = frequenciaAudivel(30.87);
  assert.ok(Math.abs(1200 * Math.log2(frequencia / 30.87) - 1200) < 1e-9);
});

test('o limite não sobe cordas que já são audíveis', () => {
  const { oitavaAcima } = frequenciaAudivel(LIMITE_OITAVA_ACIMA_HZ);
  assert.equal(oitavaAcima, false, 'exatamente no limite não deve subir');
});
