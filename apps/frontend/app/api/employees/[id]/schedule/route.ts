import {
  proxyApiIdJsonBodyRequest,
  type IdRouteContext,
} from '@/lib/api-route';

export async function PATCH(request: Request, context: IdRouteContext) {
  return proxyApiIdJsonBodyRequest(
    request,
    context,
    (id) => `/employees/${id}/schedule`,
    'PATCH',
    'Impossible d’affecter le planning de l’employé.',
  );
}
