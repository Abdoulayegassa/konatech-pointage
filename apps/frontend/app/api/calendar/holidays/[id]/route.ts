import {
  proxyApiIdJsonBodyRequest,
  proxyApiRequest,
  type IdRouteContext,
} from '@/lib/api-route';

export async function PATCH(request: Request, context: IdRouteContext) {
  return proxyApiIdJsonBodyRequest(
    request,
    context,
    (id) => `/calendar/holidays/${id}`,
    'PATCH',
    'Impossible de mettre a jour le jour ferie RH.',
  );
}

export async function DELETE(_: Request, context: IdRouteContext) {
  const { id } = await context.params;

  return proxyApiRequest(
    `/calendar/holidays/${id}`,
    { method: 'DELETE' },
    'Impossible de supprimer le jour ferie RH.',
  );
}
