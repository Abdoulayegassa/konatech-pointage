import { proxyApiFileRequest } from '@/lib/api-route';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const incoming = new URL(request.url).searchParams;
  const forwarded = new URLSearchParams();
  for (const key of ['mode', 'month', 'year', 'startDate', 'endDate', 'employeeId', 'format'] as const) {
    const value = incoming.get(key);
    if (value !== null) forwarded.set(key, value);
  }
  return proxyApiFileRequest(
    `/attendance-sites/${encodeURIComponent(id)}/reports/export?${forwarded}`,
    { method: 'GET', cache: 'no-store' },
    'Impossible de générer l’export du rapport du site.',
  );
}
