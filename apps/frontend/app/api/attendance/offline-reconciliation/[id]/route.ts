import { proxyApiRequest, type IdRouteContext } from '@/lib/api-route';

export async function GET(_request: Request, context: IdRouteContext) {
  const { id } = await context.params;
  const response = await proxyApiRequest(
    `/attendance/offline-reconciliation/${encodeURIComponent(id)}`,
    { method: 'GET' },
    'Impossible de charger la réconciliation.',
  );
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
