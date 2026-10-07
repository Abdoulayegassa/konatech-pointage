import { proxyApiRequest } from '@/lib/api-route';
import { proxyApiJsonBodyRequest } from '@/lib/api-route';

export async function GET(request: Request) {
  const source = new URL(request.url);
  const query = new URLSearchParams();
  for (const key of ['search', 'plan', 'status']) {
    const value = source.searchParams.get(key);
    if (value) query.set(key, value);
  }
  return proxyApiRequest(
    `/platform/organizations${query.size ? `?${query.toString()}` : ''}`,
    { method: 'GET' },
    'Impossible de charger les organisations.',
  );
}

export async function POST(request: Request) {
  return proxyApiJsonBodyRequest(
    request,
    '/platform/organizations',
    'POST',
    'Impossible de créer l’organisation.',
  );
}
