import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Konatech Pointage',
  description: 'Plateforme de pointage et de suivi RH pour Konatech.',
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
