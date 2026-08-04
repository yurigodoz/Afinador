import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CODIGO,
  classificarErro,
  descreverErro,
  pareceDesenvolvimento,
  restricoesDeAudio,
  verificarAmbiente,
} from './erros-microfone.js';

/** Reproduz o formato do que o `getUserMedia` rejeita. */
function excecao(name) {
  const erro = new Error(name);
  erro.name = name;
  return erro;
}

test('contexto inseguro tem prioridade sobre falta de mediaDevices', () => {
  // Sem HTTPS o `navigator.mediaDevices` some na maioria dos navegadores. Se a
  // ordem fosse invertida, todo acesso por IP na rede local seria diagnosticado
  // como "navegador sem suporte" e mandaria o usuário para o lugar errado.
  const codigo = verificarAmbiente({ isSecureContext: false, temMediaDevices: false });
  assert.equal(codigo, CODIGO.CONTEXTO_INSEGURO);
});

test('ambiente sem impedimento devolve null', () => {
  assert.equal(verificarAmbiente({ isSecureContext: true, temMediaDevices: true }), null);
});

test('navegador seguro mas sem a API é falta de suporte', () => {
  assert.equal(
    verificarAmbiente({ isSecureContext: true, temMediaDevices: false }),
    CODIGO.SEM_SUPORTE,
  );
});

test('permissão negada, inclusive pelos nomes legados', () => {
  assert.equal(classificarErro(excecao('NotAllowedError')), CODIGO.NEGADO);
  assert.equal(classificarErro(excecao('PermissionDeniedError')), CODIGO.NEGADO);
  assert.equal(classificarErro(excecao('SecurityError')), CODIGO.NEGADO);
});

test('ausência de dispositivo de entrada', () => {
  assert.equal(classificarErro(excecao('NotFoundError')), CODIGO.SEM_DISPOSITIVO);
  assert.equal(classificarErro(excecao('DevicesNotFoundError')), CODIGO.SEM_DISPOSITIVO);
});

test('restrições recusadas viram falta de dispositivo compatível', () => {
  // Pedimos o processamento de voz desligado; se nenhuma entrada aceita, é aqui
  // que o navegador reclama.
  assert.equal(classificarErro(excecao('OverconstrainedError')), CODIGO.SEM_DISPOSITIVO);
  assert.equal(classificarErro(excecao('ConstraintNotSatisfiedError')), CODIGO.SEM_DISPOSITIVO);
});

test('microfone ocupado por outro programa', () => {
  assert.equal(classificarErro(excecao('NotReadableError')), CODIGO.DISPOSITIVO_OCUPADO);
  assert.equal(classificarErro(excecao('TrackStartError')), CODIGO.DISPOSITIVO_OCUPADO);
});

test('erro desconhecido ou ausente não estoura', () => {
  assert.equal(classificarErro(excecao('AlgoQueNinguemViu')), CODIGO.DESCONHECIDO);
  assert.equal(classificarErro(null), CODIGO.DESCONHECIDO);
  assert.equal(classificarErro(undefined), CODIGO.DESCONHECIDO);
});

test('todo código tem texto com causa e caminho de solução (FR-2)', () => {
  for (const codigo of Object.values(CODIGO)) {
    const texto = descreverErro(codigo);
    assert.ok(texto.titulo?.length > 0, `${codigo} sem título`);
    assert.ok(texto.mensagem?.length > 0, `${codigo} sem mensagem`);
    assert.ok(
      texto.comoResolver?.length > 0,
      `${codigo} não diz o que o usuário deve fazer — é o ponto do requisito`,
    );
  }
});

test('código desconhecido cai no texto genérico em vez de undefined', () => {
  const texto = descreverErro('isto-nao-existe');
  assert.equal(texto.titulo, descreverErro(CODIGO.DESCONHECIDO).titulo);
});

test('reconhece endereços de desenvolvimento', () => {
  for (const host of [
    'localhost',
    'app.localhost',
    '127.0.0.1',
    '::1',
    '192.168.1.44',
    '10.0.0.7',
    '172.16.0.1',
    '172.31.255.254',
  ]) {
    assert.equal(pareceDesenvolvimento(host), true, `${host} devia contar como desenvolvimento`);
  }
});

test('endereços públicos não são confundidos com desenvolvimento', () => {
  for (const host of [
    'afinador.godoz.dev.br',
    'godoz.dev.br',
    '172.15.0.1', // logo abaixo da faixa privada
    '172.32.0.1', // logo acima da faixa privada
    '11.0.0.1',
    '193.168.1.1', // parecido com 192.168, mas público
    '',
  ]) {
    assert.equal(pareceDesenvolvimento(host), false, `${host} não é desenvolvimento`);
  }
});

test('a dica técnica só aparece em desenvolvimento', () => {
  // Em produção, mandar o visitante "rodar npm run dev:https" é instrução sem
  // sentido — e passa a impressão de site quebrado por descuido.
  const producao = descreverErro(CODIGO.CONTEXTO_INSEGURO);
  assert.equal(producao.dica, undefined);
  assert.ok(!producao.comoResolver.includes('npm'));

  const dev = descreverErro(CODIGO.CONTEXTO_INSEGURO, { desenvolvimento: true });
  assert.ok(dev.dica?.includes('dev:https'));
  assert.equal(dev.titulo, producao.titulo, 'o texto principal é o mesmo nos dois casos');
});

test('a dica não vaza para outros erros em desenvolvimento', () => {
  for (const codigo of Object.values(CODIGO)) {
    if (codigo === CODIGO.CONTEXTO_INSEGURO) continue;
    assert.equal(
      descreverErro(codigo, { desenvolvimento: true }).dica,
      undefined,
      `${codigo} não devia ganhar dica`,
    );
  }
});

test('as três flags de processamento de voz vão desligadas (FR-1, D8)', () => {
  const { audio } = restricoesDeAudio();
  assert.equal(audio.echoCancellation, false);
  assert.equal(audio.noiseSuppression, false);
  assert.equal(audio.autoGainControl, false);
});
