/**
 * Manifest do app instalável (D24).
 *
 * `display: standalone` tira a barra do navegador — o que importa aqui não é
 * estética: é área de tela. O mostrador é o elemento dominante (NFR-7) e a lista
 * de cordas precisa caber sem rolagem (FR-15), e a barra de endereço come uma
 * faixa relevante num celular.
 *
 * `orientation: portrait` porque o afinador é operado com o instrumento nas mãos;
 * girar a tela sem querer no meio da afinação atrapalha e não traz nada.
 */
export default function manifest() {
  return {
    name: 'Afinador — Violão e Baixo',
    short_name: 'Afinador',
    description:
      'Afinador cromático de violão, guitarra e baixo. Funciona offline e o áudio não sai do aparelho.',
    lang: 'pt-BR',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b0f14',
    theme_color: '#0b0f14',
    categories: ['music', 'utilities'],
    icons: [
      { src: '/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // O Android recorta o ícone em formas variadas e só garante os 80%
      // centrais; esta versão tem margem extra para não perder o ponteiro.
      { src: '/icone-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
