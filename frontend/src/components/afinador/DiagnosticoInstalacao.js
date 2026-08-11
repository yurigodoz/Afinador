'use client';

/**
 * Sinais de instalabilidade, para a página de diagnóstico.
 *
 * Existe pelo mesmo motivo do resto da página (decisions.md D16): "não pediu
 * para instalar" não é diagnosticável. Os critérios de instalação do Chromium
 * são vários e falham em silêncio — um único deles reprovado e o
 * `beforeinstallprompt` simplesmente não acontece, sem mensagem nenhuma.
 *
 * O critério que mais surpreende é o certificado: **origem com certificado
 * inválido não é instalável**, mesmo que o usuário tenha passado pelo aviso do
 * navegador. E o mesmo erro costuma impedir o registro do service worker. Por
 * isso o teste em rede local com certificado autoassinado não reproduz o
 * comportamento de produção.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';

function Linha({ rotulo, valor, ok }) {
  const cor = ok === undefined ? 'text-texto' : ok ? 'text-afinado' : 'text-longe';
  return (
    <>
      <dt>{rotulo}</dt>
      <dd className={`text-right ${cor}`}>{valor}</dd>
    </>
  );
}

const semAssinatura = () => () => {};

export default function DiagnosticoInstalacao() {
  const contextoSeguro = useSyncExternalStore(
    semAssinatura,
    () => window.isSecureContext,
    () => false,
  );

  const instalado = useSyncExternalStore(
    semAssinatura,
    () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true,
    () => false,
  );

  const [swRegistrado, setSwRegistrado] = useState(null);
  const [promptRecebido, setPromptRecebido] = useState(false);

  useEffect(() => {
    const aoOferecer = () => setPromptRecebido(true);
    window.addEventListener('beforeinstallprompt', aoOferecer);

    navigator.serviceWorker?.getRegistration().then((registro) => {
      setSwRegistrado(!!registro);
    });

    return () => window.removeEventListener('beforeinstallprompt', aoOferecer);
  }, []);

  /*
   * Pelo `useSyncExternalStore`, e não por `typeof window !== 'undefined'` no
   * corpo do render.
   *
   * A diferença não é estilo. Um ternário sobre `window` faz o servidor produzir
   * um texto e o cliente outro, e o React acusa divergência de hidratação — foi
   * exatamente o que aconteceu aqui. Já o `useSyncExternalStore` é feito para
   * isto: o React usa o `getServerSnapshot` durante a hidratação e só depois
   * troca pelo valor do cliente, sem divergência. É por isso que os outros
   * campos deste componente nunca reclamaram e este reclamava.
   */
  const origem = useSyncExternalStore(semAssinatura, () => window.location.origin, () => '—');

  return (
    <section className="rounded-2xl border border-borda bg-superficie p-5">
      <h2 className="mb-3 text-sm text-texto-fraco">Instalação</h2>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-xs text-texto-fraco">
        <Linha rotulo="Origem" valor={origem} />
        <Linha
          rotulo="Contexto seguro"
          valor={contextoSeguro ? 'sim' : 'não'}
          ok={contextoSeguro}
        />
        <Linha
          rotulo="Service worker"
          valor={swRegistrado === null ? '…' : swRegistrado ? 'registrado' : 'não registrado'}
          ok={swRegistrado ?? undefined}
        />
        <Linha
          rotulo="Convite do navegador"
          valor={promptRecebido ? 'recebido' : 'não recebido'}
          ok={promptRecebido || instalado}
        />
        <Linha rotulo="Rodando instalado" valor={instalado ? 'sim' : 'não'} />
      </dl>

      {!instalado && !promptRecebido ? (
        <p className="mt-3 text-xs text-texto-fraco">
          Sem o convite do navegador, a causa mais comum é <strong>certificado inválido</strong>:
          origem com aviso de segurança não conta como instalável, mesmo depois de você prosseguir.
          Em rede local isso é esperado — o teste que vale é no domínio público.
        </p>
      ) : null}
    </section>
  );
}
