import { proxyApiJsonBodyRequest, proxyApiRequest } from '@/lib/api-route';

export async function GET() {
  return proxyApiRequest(
    '/schedules',
    { method: 'GET' },
    'Impossible de charger les plannings.',
  );
}

export async function POST(request: Request) {
  return proxyApiJsonBodyRequest(
    request,
    '/schedules',
    'POST',
    'Impossible de creer le planning.',
  );
}
