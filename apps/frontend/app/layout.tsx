import type { Metadata } from 'next';
import './globals.css';
import { LegacyRootServiceWorkerCleanup } from '@/components/pwa/legacy-root-service-worker-cleanup';
import { TooltipProvider } from '@/components/ui/primitives/tooltip';

export const metadata: Metadata = {
  title: { default: 'InOut', template: '%s | InOut' },
  description: 'Gestion des présences et des opérations de votre organisation avec InOut.',
  icons: {
    icon: [{ url: '/brand/inout-favicon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/brand/inout-apple-touch-icon.png', sizes: '180x180' }],
  },
  formatDetection: { telephone: false },
};

export const dynamic = 'force-dynamic';

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="fr">
      <body>
        <LegacyRootServiceWorkerCleanup />
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
