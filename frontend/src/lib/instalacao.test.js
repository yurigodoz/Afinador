import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DIAS_ATE_PERGUNTAR_DE_NOVO,
  deveConvidar,
  lerDispensa,
  pareceIOS,
} from './instalacao.js';

const DIA = 24 * 60 * 60 * 1000;
const AGORA = 1_800_000_000_000;

test('não convida quem já está com o app instalado', () => {
  assert.equal(
    deveConvidar({ instalado: true, temPromptNativo: true, ios: false, agora: AGORA }),
    false,
  );
  assert.equal(deveConvidar({ instalado: true, temPromptNativo: false, ios: true, agora: AGORA }), false);
});

test('convida quando o navegador ofereceu o prompt nativo', () => {
  assert.equal(
    deveConvidar({ instalado: false, temPromptNativo: true, ios: false, agora: AGORA }),
    true,
  );
});

test('convida no iOS mesmo sem prompt nativo', () => {
  // Lá a instalação é manual, pelo menu de compartilhamento — o convite vira
  // instrução, mas continua sendo útil.
  assert.equal(
    deveConvidar({ instalado: false, temPromptNativo: false, ios: true, agora: AGORA }),
    true,
  );
});

test('não convida quando não há caminho de instalação', () => {
  // Navegador sem suporte, ou que já considera o app instalado e por isso não
  // dispara o prompt. Oferecer algo que não vai funcionar é pior que não
  // oferecer.
  assert.equal(
    deveConvidar({ instalado: false, temPromptNativo: false, ios: false, agora: AGORA }),
    false,
  );
});

test('dispensa recente silencia o convite', () => {
  const ontem = AGORA - DIA;
  assert.equal(
    deveConvidar({
      instalado: false,
      temPromptNativo: true,
      ios: false,
      dispensadoEm: ontem,
      agora: AGORA,
    }),
    false,
  );
});

test('depois do prazo, o convite volta', () => {
  const limite = DIAS_ATE_PERGUNTAR_DE_NOVO * DIA;

  const dentroDoPrazo = deveConvidar({
    instalado: false,
    temPromptNativo: true,
    ios: false,
    dispensadoEm: AGORA - limite + 1000,
    agora: AGORA,
  });
  assert.equal(dentroDoPrazo, false);

  const passouDoPrazo = deveConvidar({
    instalado: false,
    temPromptNativo: true,
    ios: false,
    dispensadoEm: AGORA - limite - 1000,
    agora: AGORA,
  });
  assert.equal(passouDoPrazo, true);
});

test('reconhece iPhone e iPad', () => {
  assert.equal(pareceIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), true);
  assert.equal(pareceIOS('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), true);
  assert.equal(pareceIOS('Mozilla/5.0 (Linux; Android 14)'), false);
  assert.equal(pareceIOS('Mozilla/5.0 (Windows NT 10.0)'), false);
  assert.equal(pareceIOS(''), false);
  assert.equal(pareceIOS(undefined), false);
});

test('dispensa guardada tolera lixo no armazenamento', () => {
  assert.equal(lerDispensa(String(AGORA)), AGORA);
  assert.equal(lerDispensa('não é número'), null);
  assert.equal(lerDispensa(null), null);
  assert.equal(lerDispensa('0'), null);
  assert.equal(lerDispensa('-5'), null);
});
