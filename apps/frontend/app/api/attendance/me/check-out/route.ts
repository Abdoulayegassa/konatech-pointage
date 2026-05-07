import { proxyApiJsonBodyRequest } from '@/lib/api-route';

export async function POST(request: Request) {
  return proxyApiJsonBodyRequest(
    request,
    '/attendance/me/check-out',
    'POST',
    'Impossible de pointer la sortie.',
    {
      sessionMode: 'attendance-entry',
    },
  );
}
