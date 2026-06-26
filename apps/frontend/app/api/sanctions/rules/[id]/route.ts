import {
  proxyApiIdJsonBodyRequest,
  type IdRouteContext,
} from '@/lib/api-route';

export async function PATCH(request: Request, context: IdRouteContext) {
  return proxyApiIdJsonBodyRequest(
    request,
    context,
    (id) => `/sanctions/rules/${id}`,
    'PATCH',
    'Impossible de mettre a jour la regle de sanction.',
  );
}
