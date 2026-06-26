import { proxyApiRequest } from '@/lib/api-route';

export async function GET(request: Request) {
  const { search } = new URL(request.url);

  return proxyApiRequest(
    `/calendar/month${search}`,
    { method: 'GET' },
    'Impossible de charger le calendrier RH.',
  );
}
