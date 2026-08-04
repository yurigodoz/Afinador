'use client';

/**
 * Estados de permissão do microfone (FR-1, FR-2, NFR-4).
 *
 * Nenhum caminho aqui reabre o prompt sozinho. Um `getUserMedia` automático
 * depois de uma negativa não faz o navegador perguntar de novo — ele rejeita na
 * hora, e a página entraria em laço tentando. Reabrir é sempre ação do usuário.
 */

import { ESTADO } from '@/hooks/useMicrofone';
import Botao from '@/components/ui/Botao';

function Cartao({ children }) {
  return (
    <div className="w-full rounded-2xl border border-borda bg-superficie p-6 text-center">
      {children}
    </div>
  );
}

export default function PermissaoMicrofone({ estado, erro, aoIniciar }) {
  if (estado === ESTADO.PEDINDO) {
    return (
      <Cartao>
        <p className="text-sm text-texto-fraco" aria-live="polite">
          Aguardando sua autorização para usar o microfone…
        </p>
      </Cartao>
    );
  }

  if (estado === ESTADO.ERRO && erro) {
    return (
      <Cartao>
        <div role="alert">
          <h2 className="text-base font-semibold text-longe">{erro.titulo}</h2>
          <p className="mt-2 text-sm text-texto-fraco">{erro.mensagem}</p>
          <p className="mt-3 text-sm text-texto">{erro.comoResolver}</p>
        </div>
        <Botao variante="secundario" className="mt-5" onClick={aoIniciar}>
          Tentar de novo
        </Botao>
      </Cartao>
    );
  }

  return (
    <Cartao>
      <h2 className="text-base font-semibold">Afine pelo microfone</h2>
      <p className="mt-2 text-sm text-texto-fraco">
        O áudio é analisado aqui mesmo, no seu aparelho. Nada é gravado, enviado ou armazenado.
      </p>
      <Botao className="mt-5 w-full" onClick={aoIniciar}>
        Ligar o microfone
      </Botao>
    </Cartao>
  );
}
