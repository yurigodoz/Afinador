'use client';

/**
 * Convite para instalar o app.
 *
 * Aparece **apenas na tela inicial**, antes de ligar o microfone. Durante a
 * afinação a tela pertence ao mostrador (NFR-7) e precisa caber sem rolagem
 * (FR-15) — um banner ali competiria com a única coisa que o usuário está
 * olhando.
 *
 * **Acima do cartão de permissão, e de propósito.** A tela inicial dura uns dois
 * segundos: quem chega para afinar toca no botão principal na hora. Abaixo dele,
 * o convite seria invisível na prática.
 *
 * **Por isso mesmo, peso visual reduzido.** Se estivesse acima com um botão de
 * destaque, seriam dois botões verdes empilhados e o usuário poderia tocar no
 * errado — justamente quando o que ele quer é o outro. Aqui o convite é visto;
 * o botão de ligar o microfone continua sendo o que chama.
 *
 * Dispensável, e a dispensa vale por 15 dias. Um convite que reaparece a cada
 * visita vira ruído, e ruído numa ferramenta usada por 30 segundos é pior que a
 * ausência do recurso.
 */

import Botao from '@/components/ui/Botao';

export default function ConviteInstalacao({ manual, aoInstalar, aoDispensar }) {
  return (
    <section className="rounded-2xl border border-borda bg-superficie p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-texto">Instale o afinador</h2>
          <p className="mt-1 text-sm text-texto-fraco">
            Fica na tela inicial e funciona sem internet — útil em ensaio, sítio ou palco.
          </p>
        </div>

        <button
          type="button"
          onClick={aoDispensar}
          aria-label="Dispensar o convite de instalação"
          className="-mt-1 -mr-1 min-h-9 min-w-9 rounded-lg text-texto-fraco hover:text-texto"
        >
          ✕
        </button>
      </div>

      {manual ? (
        // iOS não expõe instalação por código: só resta mostrar o caminho.
        <p className="mt-3 text-sm text-texto">
          Toque em <strong>Compartilhar</strong> e depois em{' '}
          <strong>Adicionar à Tela de Início</strong>.
        </p>
      ) : (
        <Botao variante="secundario" className="mt-3 w-full" onClick={aoInstalar}>
          Instalar
        </Botao>
      )}
    </section>
  );
}
