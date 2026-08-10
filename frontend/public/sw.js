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

const VERSAO = 'afinador-v1';
const CACHE_ESTATICO = `${VERSAO}-estatico`;
const CACHE_PAGINAS = `${VERSAO}-paginas`;

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
            .filter((nome) => !nome.startsWith(VERSAO))
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
