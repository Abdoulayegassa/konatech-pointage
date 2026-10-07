import { proxyApiRequest } from '@/lib/api-route';

export async function GET() {
  return proxyApiRequest(
    '/platform/dashboard',
    { method: 'GET' },
    'Impossible de charger le tableau de bord plateforme.',
  );
}
