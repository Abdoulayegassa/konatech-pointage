import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Konatech Pointage',
  description: 'Plateforme de pointage et de suivi RH pour Konatech.',
  icons: {
    icon: [
      { url: '/icon-konatech.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const dynamic = 'force-dynamic';

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
