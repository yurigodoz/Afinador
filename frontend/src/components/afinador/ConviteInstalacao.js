'use client';

/**
 * Convite para instalar o app, no formato usado no Luccare.
 *
 * Barra flutuante no rodapé, com o ícone do app à esquerda, texto no meio e as
 * ações à direita. Flutuar em vez de ocupar espaço no fluxo resolve o problema
 * que motivou a versão anterior deste componente: ele fica visível sem empurrar
 * nada e sem disputar posição com o botão principal.
 *
 * "Agora não" em vez de um ✕. O ✕ economiza espaço e diz menos: não deixa claro
 * se dispensa para sempre ou só desta vez, nem que a resposta é adiável.
 *
 * Aparece em **todas as telas**, inclusive durante a afinação, sobrepondo o que
 * estiver embaixo. É temporário — some ao instalar ou ao dispensar — e a página
 * continua rolável, então não vale reservar espaço permanente por causa dele.
 */

export default function ConviteInstalacao({ manual, aoInstalar, aoDispensar }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-[520px] items-center gap-3 rounded-xl border border-borda bg-superficie p-3 shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icone-192.png" alt="" className="h-12 w-12 shrink-0 rounded-lg" />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-texto">Instalar o Afinador</p>
          {manual ? (
            // iOS não expõe instalação por código: só resta mostrar o caminho.
            <p className="text-sm text-texto-fraco">
              Toque em Compartilhar e depois em &quot;Adicionar à Tela de Início&quot;.
            </p>
          ) : (
            <p className="text-sm text-texto-fraco">
              Abre da tela inicial e funciona sem internet.
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-1">
          {manual ? null : (
            <button
              type="button"
              onClick={aoInstalar}
              className="min-h-9 rounded-lg bg-afinado px-4 text-sm font-medium text-fundo"
            >
              Instalar
            </button>
          )}
          <button
            type="button"
            onClick={aoDispensar}
            className="min-h-9 rounded-lg px-4 text-sm text-texto-fraco hover:text-texto"
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}
