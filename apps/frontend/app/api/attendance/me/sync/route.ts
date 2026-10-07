import { proxyApiJsonBodyRequest } from '@/lib/api-route';

export async function POST(request: Request) {
  return proxyApiJsonBodyRequest(
    request,
    '/attendance/me/sync',
    'POST',
    'Impossible de synchroniser le pointage hors ligne.',
    { sessionMode: 'attendance-entry' },
  );
}
