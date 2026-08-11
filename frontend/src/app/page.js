import Afinador from '@/components/afinador/Afinador';

export default function Pagina() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[520px] flex-col justify-center gap-6 px-5 py-8">
      <header className="text-center">
        <h1 className="text-xl font-semibold tracking-tight">Afinador</h1>
      </header>

      {/*
        Sem link para /diagnostico: a página existe para suporte (D16), não para
        o uso normal. Quem precisa dela digita o endereço.
      */}
      <Afinador />
    </main>
  );
}
