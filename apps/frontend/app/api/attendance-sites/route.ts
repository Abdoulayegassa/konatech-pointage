import { proxyApiJsonBodyRequest, proxyApiRequest } from '@/lib/api-route';

export async function GET() {
  return proxyApiRequest(
    '/attendance-sites',
    { method: 'GET' },
    'Impossible de charger les sites de présence.',
  );
}

export async function POST(request: Request) {
  return proxyApiJsonBodyRequest(
    request,
    '/attendance-sites',
    'POST',
    'Impossible de créer le site de présence.',
  );
}
