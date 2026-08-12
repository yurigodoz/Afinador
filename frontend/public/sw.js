/**
 * Service worker do Afinador.
 *
 * O app é um caso fácil de offline: não há backend, nenhuma chamada de rede
 * depois da carga, e as preferências ficam no `localStorage`. Não há dado a
 * sincronizar nem fila de escrita — só é preciso guardar os arquivos.
 *
 * Três estratégias, por tipo de recurso:
 *
 * - **Assets com hash** (`/_next/static/`): cache primeiro, sem revalidar. O
 *   nome do arquivo muda quando o conteúdo muda, então o cache nunca fica velho.
 * - **Navegação** (páginas): rede primeiro, cache como reserva. Assim uma
 *   correção chega na próxima visita com rede, e o app continua abrindo sem ela.
 * - **Resto** (ícones, manifest): devolve do cache e revalida por trás.
 *
 * **Sobre atualizações.** Esta versão não faz `skipWaiting` sozinha. Trocar o
 * app por baixo de alguém que está no meio de uma afinação é pior que esperar:
 * a página avisa que há versão nova e a troca acontece quando o usuário aceita.
 * Era exatamente esse ciclo de invalidação que fez o PWA ficar adiado até o
 * projeto estar validado (decisions.md D10).
 */

/**
 * ⚠️  MUDE A CADA DEPLOY que altere os arquivos do app.
 *
 * O formato é livre — `v2`, `v1.0.1`, uma data, o hash do commit. O que importa
 * é ser **diferente do deploy anterior**.
 *
 * Duas coisas dependem disto:
 *
 * 1. O navegador só instala um service worker novo se este arquivo mudar **byte
 *    a byte**. Sem alterar a versão, o aviso de "nova versão" não aparece.
 * 2. O `activate` apaga os caches que não pertencem a esta versão — sem mudar,
 *    arquivos de builds antigos ficam no aparelho para sempre.
 *
 * Quem está online recebe a atualização mesmo sem isto, porque as páginas usam
 * rede primeiro. O que se perde é o recarregamento limpo e a faxina do cache.
 */
const VERSAO = 'v1.0.1';

/** Prefixo de tudo que este app guarda, para não mexer no cache de vizinhos. */
const PREFIXO = 'afinador-';

const CACHE_ESTATICO = `${PREFIXO}${VERSAO}-estatico`;
const CACHE_PAGINAS = `${PREFIXO}${VERSAO}-paginas`;

/**
 * Nomes exatos, e não comparação por prefixo.
 *
 * Uma versão anterior apagava tudo que **não começasse** pela versão atual. Isso
 * quebra com numeração de ponto: saindo de `v1.0.10` para `v1.0.1`, o cache
 * antigo `afinador-v1.0.10-estatico` começa com `afinador-v1.0.1` e escaparia da
 * faxina. Comparar por igualdade elimina a ambiguidade seja qual for o formato.
 */
const CACHES_DESTA_VERSAO = new Set([CACHE_ESTATICO, CACHE_PAGINAS]);

/** O mínimo para o app abrir sem rede logo depois de instalado. */
const ESSENCIAIS = [
  '/',
  '/diagnostico',
  '/manifest.webmanifest',
  '/icone-192.png',
  '/icone-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_PAGINAS).then((cache) =>
      // `addAll` falha inteiro se um item falhar; aqui cada um é independente
      // para uma rota ausente não impedir a instalação do resto.
      Promise.allSettled(ESSENCIAIS.map((url) => cache.add(url))),
    ),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) =>
        Promise.all(
          nomes
            .filter((nome) => nome.startsWith(PREFIXO) && !CACHES_DESTA_VERSAO.has(nome))
            .map((nome) => caches.delete(nome)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** A página pede a troca quando o usuário aceita atualizar. */
self.addEventListener('message', (evento) => {
  if (evento.data === 'TROCAR_AGORA') self.skipWaiting();
});

async function cachePrimeiro(requisicao, nomeCache) {
  const cache = await caches.open(nomeCache);
  const guardado = await cache.match(requisicao);
  if (guardado) return guardado;

  const resposta = await fetch(requisicao);
  if (resposta.ok) cache.put(requisicao, resposta.clone());
  return resposta;
}

async function redePrimeiro(requisicao) {
  const cache = await caches.open(CACHE_PAGINAS);
  try {
    const resposta = await fetch(requisicao);
    if (resposta.ok) cache.put(requisicao, resposta.clone());
    return resposta;
  } catch (erro) {
    const guardado = (await cache.match(requisicao)) ?? (await cache.match('/'));
    if (guardado) return guardado;
    throw erro;
  }
}

async function revalidandoAtras(requisicao) {
  const cache = await caches.open(CACHE_ESTATICO);
  const guardado = await cache.match(requisicao);

  const emRede = fetch(requisicao)
    .then((resposta) => {
      if (resposta.ok) cache.put(requisicao, resposta.clone());
      return resposta;
    })
    .catch(() => guardado);

  return guardado ?? emRede;
}

self.addEventListener('fetch', (evento) => {
  const { request } = evento;

  // Só GET e só o próprio domínio: o afinador não fala com mais ninguém, e
  // interceptar terceiros seria assumir responsabilidade sobre o que não é nosso.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    evento.respondWith(redePrimeiro(request));
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    evento.respondWith(cachePrimeiro(request, CACHE_ESTATICO));
    return;
  }

  evento.respondWith(revalidandoAtras(request));
});
