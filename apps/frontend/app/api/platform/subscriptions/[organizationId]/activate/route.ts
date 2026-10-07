import { proxyApiIdJsonBodyRequest } from '@/lib/api-route';
export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  return proxyApiIdJsonBodyRequest(
    request,
    {
      params: context.params.then(({ organizationId }) => ({
        id: organizationId,
      })),
    },
    (id) => `/platform/subscriptions/${id}/activate`,
    'POST',
    'Activation impossible.',
  );
}
