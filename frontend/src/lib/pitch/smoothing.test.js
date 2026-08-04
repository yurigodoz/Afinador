import test from 'node:test';
import assert from 'node:assert/strict';

import {
  criarConfirmadorAfinado,
  criarFiltroFrequencia,
  criarSuavizadorCents,
} from './smoothing.js';

test('mediana descarta outlier isolado (erro de oitava num único frame)', () => {
  const filtro = criarFiltroFrequencia();
  let t = 0;

  for (const f of [110, 110.2, 109.9, 110.1, 110]) {
    filtro.processar(f, (t += 33));
  }

  // Um frame com o dobro da frequência não pode arrastar a leitura.
  const comOutlier = filtro.processar(220, (t += 33));
  assert.ok(
    Math.abs(comOutlier - 110) < 1,
    `mediana foi para ${comOutlier} — o outlier passou`,
  );
});

test('retenção segura o último valor por 400 ms e depois solta (FR-4)', () => {
  const filtro = criarFiltroFrequencia({ retencaoMs: 400 });
  let t = 0;

  for (let i = 0; i < 5; i += 1) filtro.processar(196, (t += 33));

  assert.equal(filtro.processar(null, t + 100), 196, 'deve reter logo após perder o sinal');
  assert.equal(filtro.processar(null, t + 399), 196, 'ainda dentro da janela de retenção');
  assert.equal(filtro.processar(null, t + 401), null, 'passou da retenção, deve soltar');
  assert.equal(filtro.processar(null, t + 500), null, 'segue solto');
});

test('depois de soltar, a janela recomeça limpa', () => {
  const filtro = criarFiltroFrequencia({ retencaoMs: 100 });
  let t = 0;

  for (let i = 0; i < 5; i += 1) filtro.processar(82.41, (t += 33));
  filtro.processar(null, t + 500);

  // Nota nova, bem distante: a primeira leitura já deve refletir só ela.
  const nova = filtro.processar(329.63, t + 600);
  assert.ok(Math.abs(nova - 329.63) < 0.01, `sobrou memória da nota antiga: ${nova}`);
});

test('suavização exponencial converge para o valor estável', () => {
  const suavizador = criarSuavizadorCents({ alfa: 0.25 });

  let valor = suavizador.processar(20, 'corda-6');
  assert.equal(valor, 20, 'a primeira leitura entra inteira');

  for (let i = 0; i < 40; i += 1) valor = suavizador.processar(0, 'corda-6');
  assert.ok(Math.abs(valor) < 0.5, `não convergiu: ${valor}`);
});

test('salto grande dentro do mesmo alvo é assumido, não interpolado', () => {
  // Regressão do bug relatado por Yuri: com a corda travada, afrouxá-la e depois
  // afiná-la fazia o mostrador varrer de −1800 cents até o centro ao longo de
  // ~667 ms. A suavização exponencial estava interpolando entre um desvio antigo
  // e o novo — e todo valor no meio do caminho era uma leitura que nunca
  // aconteceu.
  const suavizador = criarSuavizadorCents({ alfa: 0.25, saltoMaximoCents: 100 });
  const ALVO = 'corda-1';

  for (let i = 0; i < 10; i += 1) suavizador.processar(-1800, ALVO);

  const primeiro = suavizador.processar(0, ALVO);
  assert.equal(primeiro, 0, `deslizou para ${primeiro} em vez de assumir 0`);
});

test('variação pequena continua sendo suavizada', () => {
  // A correção acima não pode desligar a suavização: é ela que impede o ponteiro
  // de tremer com nota estável (NFR-2).
  const suavizador = criarSuavizadorCents({ alfa: 0.25, saltoMaximoCents: 100 });

  suavizador.processar(0, 'corda-1');
  const depois = suavizador.processar(20, 'corda-1');

  assert.ok(depois > 0 && depois < 20, `esperava valor intermediário, veio ${depois}`);
  assert.ok(Math.abs(depois - 5) < 0.001, `esperava 5 (α=0,25), veio ${depois}`);
});

test('reiniciar faz a próxima leitura entrar inteira', () => {
  // É o que o laço faz ao perder o sinal: sem isso o desvio guardado sobrevive
  // ao silêncio e contamina a próxima nota.
  const suavizador = criarSuavizadorCents({ alfa: 0.25 });

  for (let i = 0; i < 10; i += 1) suavizador.processar(-40, 'corda-1');
  suavizador.reiniciar();

  assert.equal(suavizador.processar(3, 'corda-1'), 3);
});

test('trocar de corda-alvo reinicia a suavização', () => {
  const suavizador = criarSuavizadorCents({ alfa: 0.25 });

  for (let i = 0; i < 20; i += 1) suavizador.processar(45, 'corda-6');

  // Sem o reset, o primeiro valor da corda nova sairia contaminado pelos +45
  // cents da anterior — um desvio que nunca existiu em nenhuma das duas.
  const primeiroDaNova = suavizador.processar(-3, 'corda-5');
  assert.equal(primeiroDaNova, -3);
});

test('afinado exige 700 ms contínuos dentro da tolerância (FR-8)', () => {
  const confirmador = criarConfirmadorAfinado({ confirmacaoMs: 700 });

  assert.equal(confirmador.processar(2, 'corda-6', 0), false);
  assert.equal(confirmador.processar(2, 'corda-6', 400), false, 'ainda cedo demais');
  assert.equal(confirmador.processar(2, 'corda-6', 699), false, 'um frame antes do limite');
  assert.equal(confirmador.processar(2, 'corda-6', 700), true, 'no limite, confirma');
});

test('sair da tolerância reinicia a contagem', () => {
  const confirmador = criarConfirmadorAfinado({ confirmacaoMs: 700 });

  confirmador.processar(2, 'corda-6', 0);
  confirmador.processar(2, 'corda-6', 600);
  confirmador.processar(30, 'corda-6', 650); // escapou
  assert.equal(confirmador.processar(2, 'corda-6', 1000), false, 'a contagem tem de recomeçar');

  // A nova contagem começa em 1000, então só confirma em 1700 — não em 1350,
  // que seria o caso se os 600 ms anteriores tivessem sido aproveitados.
  assert.equal(confirmador.processar(2, 'corda-6', 1699), false);
  assert.equal(confirmador.processar(2, 'corda-6', 1700), true);
});

test('banda morta evita o indicador piscar na borda', () => {
  const confirmador = criarConfirmadorAfinado({
    confirmacaoMs: 100,
    toleranciaAfinado: 5,
    toleranciaSaida: 10,
  });

  confirmador.processar(1, 'corda-6', 0);
  assert.equal(confirmador.processar(1, 'corda-6', 100), true);

  // Entre 5 e 10 cents mantém o selo — é a banda morta.
  assert.equal(confirmador.processar(7, 'corda-6', 150), true);
  assert.equal(confirmador.processar(9.9, 'corda-6', 200), true);

  // Acima de 10 perde.
  assert.equal(confirmador.processar(12, 'corda-6', 250), false);
});

test('trocar de corda zera o estado de afinado', () => {
  const confirmador = criarConfirmadorAfinado({ confirmacaoMs: 100 });

  confirmador.processar(0, 'corda-6', 0);
  assert.equal(confirmador.processar(0, 'corda-6', 100), true);
  assert.equal(confirmador.processar(0, 'corda-5', 110), false, 'corda nova começa do zero');
});

test('perder o sinal não apaga um afinado já confirmado', () => {
  // O usuário afina a corda e para de tocar: o selo tem de continuar lá.
  const confirmador = criarConfirmadorAfinado({ confirmacaoMs: 100 });

  confirmador.processar(1, 'corda-6', 0);
  assert.equal(confirmador.processar(1, 'corda-6', 100), true);
  assert.equal(confirmador.processar(null, 'corda-6', 200), true);
});
