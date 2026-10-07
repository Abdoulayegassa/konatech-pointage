import {
  proxyApiIdJsonBodyRequest,
  type IdRouteContext,
} from '@/lib/api-route';

export async function PATCH(request: Request, context: IdRouteContext) {
  return proxyApiIdJsonBodyRequest(
    request,
    context,
    (id) => `/attendance-sites/${id}/status`,
    'PATCH',
    'Impossible de modifier le statut du site de présence.',
  );
}
