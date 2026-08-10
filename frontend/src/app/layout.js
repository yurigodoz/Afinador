import './globals.css';

import RegistroServiceWorker from '@/components/RegistroServiceWorker';

export const metadata = {
  title: 'Afinador Online — Violão e Baixo',
  description:
    'Afine violão, guitarra e baixo pelo microfone do seu dispositivo. Funciona offline e o áudio não sai do seu aparelho.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Afinador',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icone-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
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
      <body className="min-h-dvh bg-fundo text-texto antialiased">
        {children}
        <RegistroServiceWorker />
      </body>
    </html>
  );
}
