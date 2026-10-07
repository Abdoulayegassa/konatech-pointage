import { proxyApiJsonBodyRequest } from '@/lib/api-route';

type Context = { params: Promise<{ id: string; scheduleId: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id, scheduleId } = await context.params;
  return proxyApiJsonBodyRequest(
    request,
    `/attendance-sites/${encodeURIComponent(id)}/schedules/${encodeURIComponent(scheduleId)}/status`,
    'PATCH',
    'Impossible de modifier le statut du planning du site.',
  );
}
