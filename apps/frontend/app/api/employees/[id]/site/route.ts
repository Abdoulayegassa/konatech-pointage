import {
  proxyApiIdJsonBodyRequest,
  type IdRouteContext,
} from '@/lib/api-route';

export async function PATCH(request: Request, context: IdRouteContext) {
  return proxyApiIdJsonBodyRequest(
    request,
    context,
    (id) => `/employees/${id}/site`,
    'PATCH',
    'Impossible de transférer le site de l’employé.',
  );
}
