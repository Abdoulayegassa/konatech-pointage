import { proxyApiFileRequest, type IdRouteContext } from '@/lib/api-route';

export async function GET(_request: Request, context: IdRouteContext) {
  const { id } = await context.params;

  return proxyApiFileRequest(
    `/attendance/history/${id}/selfie`,
    { method: 'GET' },
    'Impossible de charger le selfie de vérification.',
  );
}
