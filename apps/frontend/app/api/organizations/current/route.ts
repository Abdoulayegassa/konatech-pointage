import { proxyApiJsonBodyRequest, proxyApiRequest } from '@/lib/api-route';

const path = '/organizations/current';

export async function GET() {
  return proxyApiRequest(
    path,
    { method: 'GET' },
    'Impossible de charger le profil de l’organisation.',
  );
}

export async function PATCH(request: Request) {
  return proxyApiJsonBodyRequest(
    request,
    path,
    'PATCH',
    'Impossible de mettre à jour le profil de l’organisation.',
  );
}
