import {
  proxyApiIdJsonBodyRequest,
  proxyApiIdRequest,
  type IdRouteContext,
} from '@/lib/api-route';

export async function GET(_: Request, context: IdRouteContext) {
  return proxyApiIdRequest(
    context,
    (id) => `/attendance-sites/${id}/settings`,
    'Impossible de charger les réglages du site.',
  );
}

export async function PATCH(request: Request, context: IdRouteContext) {
  return proxyApiIdJsonBodyRequest(
    request,
    context,
    (id) => `/attendance-sites/${id}/settings`,
    'PATCH',
    'Impossible de mettre à jour les réglages du site.',
  );
}
