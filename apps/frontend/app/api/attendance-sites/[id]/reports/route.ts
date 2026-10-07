import { proxyApiRequest } from '@/lib/api-route';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const incoming = new URL(request.url).searchParams;
  const forwarded = new URLSearchParams();
  for (const key of ['mode', 'month', 'year', 'startDate', 'endDate', 'employeeId'] as const) {
    const value = incoming.get(key);
    if (value !== null) forwarded.set(key, value);
  }
  return proxyApiRequest(
    `/attendance-sites/${encodeURIComponent(id)}/reports?${forwarded}`,
    { method: 'GET', cache: 'no-store' },
    'Impossible de générer le rapport du site.',
  );
}
