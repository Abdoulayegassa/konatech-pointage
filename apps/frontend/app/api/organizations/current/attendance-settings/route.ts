import { proxyApiJsonBodyRequest, proxyApiRequest } from '@/lib/api-route';

const path = '/organizations/current/attendance-settings';

export async function GET() {
  return proxyApiRequest(
    path,
    { method: 'GET' },
    'Impossible de charger les paramètres de présence.',
  );
}

export async function PATCH(request: Request) {
  return proxyApiJsonBodyRequest(
    request,
    path,
    'PATCH',
    'Impossible de mettre à jour les paramètres de présence.',
  );
}
