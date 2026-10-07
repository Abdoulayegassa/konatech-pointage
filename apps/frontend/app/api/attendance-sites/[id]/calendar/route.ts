import { proxyApiRequest } from '@/lib/api-route';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  const { search } = new URL(request.url);
  return proxyApiRequest(
    `/attendance-sites/${encodeURIComponent(id)}/calendar${search}`,
    { method: 'GET' },
    'Impossible de charger le calendrier du site.',
  );
}
