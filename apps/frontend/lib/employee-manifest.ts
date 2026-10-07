import type { MetadataRoute } from 'next';

export function employeeManifest(startUrl: '/attendance-entry' | '/my-attendance'): MetadataRoute.Manifest {
  return {
    name: 'InOut',
    short_name: 'InOut',
    description: 'Pointage employé InOut, avec reprise hors connexion.',
    start_url: startUrl,
    scope: startUrl,
    display: 'standalone',
    background_color: '#fffdfb',
    theme_color: '#10323c',
    orientation: 'portrait',
    icons: [
      { src: '/brand/inout-app-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/inout-app-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/brand/inout-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
