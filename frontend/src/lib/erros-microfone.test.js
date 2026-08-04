import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CODIGO,
  classificarErro,
  descreverErro,
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

test('as três flags de processamento de voz vão desligadas (FR-1, D8)', () => {
  const { audio } = restricoesDeAudio();
  assert.equal(audio.echoCancellation, false);
  assert.equal(audio.noiseSuppression, false);
  assert.equal(audio.autoGainControl, false);
});
