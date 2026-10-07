import { proxyApiJsonBodyRequest, proxyApiRequest } from '@/lib/api-route';

type Context = { params: Promise<{ id: string; scheduleId: string }> };

export async function GET(_request: Request, context: Context) {
  const { id, scheduleId } = await context.params;
  return proxyApiRequest(
    `/attendance-sites/${encodeURIComponent(id)}/schedules/${encodeURIComponent(scheduleId)}`,
    { method: 'GET' },
    'Impossible de charger le planning du site.',
  );
}

export async function PATCH(request: Request, context: Context) {
  const { id, scheduleId } = await context.params;
  return proxyApiJsonBodyRequest(
    request,
    `/attendance-sites/${encodeURIComponent(id)}/schedules/${encodeURIComponent(scheduleId)}`,
    'PATCH',
    'Impossible de modifier le planning du site.',
  );
}
