import { proxyApiRequest } from '@/lib/api-route';

export async function GET(request: Request) {
  const response = await proxyApiRequest(
    `/attendance/offline-reconciliation${new URL(request.url).search}`,
    { method: 'GET' },
    'Impossible de charger les réconciliations.',
  );
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
