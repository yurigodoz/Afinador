/**
 * Guarda do Wave Checkpoint 0: nada em `src/lib` pode tocar navegador ou React.
 *
 * Não é preciosismo de arquitetura. É o que permite testar o algoritmo com tons
 * sintéticos em Node, sem navegador — e é essa suíte que sustenta o requisito de
 * 1 cent (NFR-1). No dia em que um `window` entrar aqui, os testes param de
 * rodar e a garantia de precisão vai junto.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ_LIB = dirname(fileURLToPath(import.meta.url));

/** APIs que só existem no navegador, mais o próprio React. */
const PROIBIDOS = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'AudioContext',
  'AnalyserNode',
  'requestAnimationFrame',
  'use client',
];

function listarArquivos(diretorio) {
  const encontrados = [];
  for (const entrada of readdirSync(diretorio)) {
    const caminho = join(diretorio, entrada);
    if (statSync(caminho).isDirectory()) {
      encontrados.push(...listarArquivos(caminho));
    } else if (entrada.endsWith('.js') && !entrada.endsWith('.test.js')) {
      encontrados.push(caminho);
    }
  }
  return encontrados;
}

/**
 * Remove comentários de bloco e de linha.
 *
 * Sem isso o teste acusaria as próprias frases que explicam a regra — foi
 * exatamente o que aconteceu na primeira versão desta verificação.
 */
function semComentarios(codigo) {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

test('nenhum módulo de lib/ referencia API de navegador ou React', () => {
  const arquivos = listarArquivos(RAIZ_LIB);
  assert.ok(arquivos.length >= 5, `esperava vários módulos, achei ${arquivos.length}`);

  for (const arquivo of arquivos) {
    const codigo = semComentarios(readFileSync(arquivo, 'utf8'));

    for (const proibido of PROIBIDOS) {
      const padrao = new RegExp(`\\b${proibido.replace(' ', '\\s+')}\\b`);
      assert.ok(
        !padrao.test(codigo),
        `${arquivo.replace(RAIZ_LIB, 'src/lib')} referencia "${proibido}" — ` +
          `módulos de lib/ têm de rodar em Node puro`,
      );
    }

    assert.ok(
      !/from\s+['"]react/.test(codigo),
      `${arquivo.replace(RAIZ_LIB, 'src/lib')} importa React`,
    );
  }
});

test('lib/ não importa de fora de lib/ (nem pelo alias @/)', () => {
  for (const arquivo of listarArquivos(RAIZ_LIB)) {
    const codigo = semComentarios(readFileSync(arquivo, 'utf8'));
    const imports = codigo.match(/from\s+['"][^'"]+['"]/g) ?? [];

    for (const linha of imports) {
      const alvo = linha.match(/['"]([^'"]+)['"]/)[1];
      assert.ok(
        alvo.startsWith('.') || alvo.startsWith('node:'),
        `${arquivo.replace(RAIZ_LIB, 'src/lib')} importa "${alvo}" — ` +
          `o alias @/ depende do bundler do Next e quebraria em \`node --test\``,
      );
    }
  }
});
