import {
  proxyApiIdJsonBodyRequest,
  type IdRouteContext,
} from '@/lib/api-route';

export async function PATCH(request: Request, context: IdRouteContext) {
  return proxyApiIdJsonBodyRequest(
    request,
    context,
    (id) => `/schedules/${id}/status`,
    'PATCH',
    'Impossible de mettre a jour le statut du planning.',
  );
}
