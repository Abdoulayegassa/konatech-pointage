import { proxyApiRequest } from '@/lib/api-route';

export async function GET(request: Request) {
  const { search } = new URL(request.url);

  return proxyApiRequest(
    `/attendance/history${search}`,
    { method: 'GET' },
    "Impossible de charger l'historique des pointages.",
  );
}
