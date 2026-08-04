'use client';

const VARIANTES = {
  primario: 'bg-afinado text-fundo hover:brightness-110 active:brightness-95',
  secundario: 'bg-superficie text-texto border border-borda hover:border-texto-fraco',
  fantasma: 'text-texto-fraco hover:text-texto',
};

export default function Botao({
  children,
  variante = 'primario',
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      // 44px de altura mínima: alvo de toque confortável em celular, que é onde
      // o afinador vai ser usado de verdade.
      className={`min-h-11 rounded-xl px-5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTES[variante]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
