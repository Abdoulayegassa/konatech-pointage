import { proxyApiJsonBodyRequest, proxyApiRequest } from '@/lib/api-route';

export async function GET(request: Request) {
  const { search } = new URL(request.url);

  return proxyApiRequest(
    `/calendar/holidays${search}`,
    { method: 'GET' },
    'Impossible de charger les jours ferie RH.',
  );
}

export async function POST(request: Request) {
  return proxyApiJsonBodyRequest(
    request,
    '/calendar/holidays',
    'POST',
    'Impossible de creer le jour ferie RH.',
  );
}
