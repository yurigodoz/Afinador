import Link from 'next/link';

import PainelDeCaptura from '@/components/afinador/PainelDeCaptura';

export const metadata = {
  title: 'Diagnóstico — Afinador',
  description: 'Página de apoio para verificar captação de áudio em um dispositivo.',
};

/**
 * Página de diagnóstico.
 *
 * Serve ao suporte remoto (`specs/.../decisions.md` D16): quando alguém relata
 * que o afinador não funciona no aparelho dele, é daqui que sai o dado útil —
 * taxa do dispositivo, nível de entrada e parâmetros do perfil ativo. Sem isso,
 * o relato chega como "não funcionou" e não há o que diagnosticar à distância.
 */
export default function PaginaDiagnostico() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[520px] flex-col justify-center gap-6 px-5 py-8">
      <header className="text-center">
        <h1 className="text-xl font-semibold tracking-tight">Diagnóstico</h1>
        <p className="mt-1 text-sm text-texto-fraco">
          Captação de áudio e parâmetros do perfil neste aparelho
        </p>
      </header>

      <PainelDeCaptura />

      <footer className="text-center">
        <Link href="/" className="text-xs text-texto-fraco underline-offset-4 hover:underline">
          Voltar ao afinador
        </Link>
      </footer>
    </main>
  );
}
