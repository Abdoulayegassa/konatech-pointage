import {
  proxyApiIdJsonBodyRequest,
  proxyApiIdRequest,
  type IdRouteContext,
} from '@/lib/api-route';

export async function GET(_: Request, context: IdRouteContext) {
  return proxyApiIdRequest(
    context,
    (id) => `/schedules/${id}`,
    'Impossible de charger le planning.',
  );
}

export async function PATCH(request: Request, context: IdRouteContext) {
  return proxyApiIdJsonBodyRequest(
    request,
    context,
    (id) => `/schedules/${id}`,
    'PATCH',
    'Impossible de mettre a jour le planning.',
  );
}
