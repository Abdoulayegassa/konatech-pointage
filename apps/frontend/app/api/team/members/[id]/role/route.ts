import {
  proxyApiIdJsonBodyRequest,
  type IdRouteContext,
} from '@/lib/api-route';

export async function PATCH(request: Request, context: IdRouteContext) {
  return proxyApiIdJsonBodyRequest(
    request,
    context,
    (id) => `/organizations/current/members/${id}/role`,
    'PATCH',
    'Impossible de modifier le rôle du membre.',
  );
}
