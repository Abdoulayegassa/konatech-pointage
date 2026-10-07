import { proxyApiRequest } from '@/lib/api-route';

export async function GET() {
  return proxyApiRequest(
    '/organizations/current/members',
    { method: 'GET' },
    'Impossible de charger les membres.',
  );
}
