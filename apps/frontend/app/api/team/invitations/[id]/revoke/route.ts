import { proxyApiRequest, type IdRouteContext } from '@/lib/api-route';

export async function PATCH(_: Request, context: IdRouteContext) {
  const { id } = await context.params;
  return proxyApiRequest(
    `/organizations/current/invitations/${id}/revoke`,
    { method: 'PATCH' },
    "Impossible de révoquer l'invitation.",
  );
}
