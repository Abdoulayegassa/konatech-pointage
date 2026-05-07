import { proxyApiJsonBodyRequest, proxyApiRequest } from '@/lib/api-route';

export async function GET() {
  return proxyApiRequest(
    '/employees',
    { method: 'GET' },
    'Impossible de charger les employes.',
  );
}

export async function POST(request: Request) {
  return proxyApiJsonBodyRequest(
    request,
    '/employees',
    'POST',
    "Impossible de creer l'employe.",
  );
}
