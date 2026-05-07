import { proxyApiFileRequest } from '@/lib/api-route';

export async function GET(request: Request) {
  const { search } = new URL(request.url);

  return proxyApiFileRequest(
    `/attendance/exports/monthly${search}`,
    { method: 'GET' },
    "Impossible de generer l'export mensuel.",
  );
}
