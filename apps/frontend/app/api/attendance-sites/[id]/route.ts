import {
  proxyApiIdJsonBodyRequest,
  type IdRouteContext,
} from '@/lib/api-route';

export async function PATCH(request: Request, context: IdRouteContext) {
  return proxyApiIdJsonBodyRequest(
    request,
    context,
    (id) => `/attendance-sites/${id}`,
    'PATCH',
    'Impossible de mettre à jour le site de présence.',
  );
}
