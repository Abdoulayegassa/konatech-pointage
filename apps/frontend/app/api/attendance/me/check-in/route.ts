import { proxyApiJsonBodyRequest } from '@/lib/api-route';

export async function POST(request: Request) {
  return proxyApiJsonBodyRequest(
    request,
    '/attendance/me/check-in',
    'POST',
    'Impossible de pointer l entree.',
    {
      sessionMode: 'attendance-entry',
    },
  );
}
