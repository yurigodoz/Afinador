import Link from 'next/link';

import Afinador from '@/components/afinador/Afinador';

export default function Pagina() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[520px] flex-col justify-center gap-6 px-5 py-8">
      <header className="text-center">
        <h1 className="text-xl font-semibold tracking-tight">Afinador</h1>
      </header>

      <Afinador />

      <footer className="text-center">
        <Link href="/diagnostico" className="text-xs text-texto-fraco underline-offset-4 hover:underline">
          Diagnóstico
        </Link>
      </footer>
    </main>
  );
}
