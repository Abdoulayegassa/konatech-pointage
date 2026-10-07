import { proxyApiIdJsonBodyRequest, type IdRouteContext } from '@/lib/api-route';

export async function POST(request: Request, context: IdRouteContext) {
  return proxyApiIdJsonBodyRequest(
    request,
    context,
    (id) => `/attendance-sites/${id}/schedules`,
    'POST',
    'Impossible de créer le planning du site.',
  );
}
