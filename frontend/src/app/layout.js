import './globals.css';

export const metadata = {
  title: 'Afinador Online — Violão e Baixo',
  description:
    'Afine violão, guitarra e baixo pelo microfone do seu dispositivo. Sem instalar nada, e o áudio não sai do seu aparelho.',
};

export const viewport = {
  themeColor: '#0b0f14',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh bg-fundo text-texto antialiased">{children}</body>
    </html>
  );
}
