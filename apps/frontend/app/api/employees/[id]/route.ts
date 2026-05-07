import {
  proxyApiIdJsonBodyRequest,
  proxyApiIdRequest,
  type IdRouteContext,
} from '@/lib/api-route';

export async function GET(_: Request, context: IdRouteContext) {
  return proxyApiIdRequest(
    context,
    (id) => `/employees/${id}`,
    "Impossible de charger l'employe.",
  );
}

export async function PATCH(request: Request, context: IdRouteContext) {
  return proxyApiIdJsonBodyRequest(
    request,
    context,
    (id) => `/employees/${id}`,
    'PATCH',
    "Impossible de mettre a jour l'employe.",
  );
}
