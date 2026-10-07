import { proxyApiFileRequest, type IdRouteContext } from '@/lib/api-route';

export async function GET(_request: Request, context: IdRouteContext) {
  const { id } = await context.params;
  const response = await proxyApiFileRequest(
    `/attendance/offline-reconciliation/${encodeURIComponent(id)}/selfie`,
    { method: 'GET' },
    'Impossible de charger la preuve.',
  );
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}
