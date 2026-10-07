import { proxyApiJsonBodyRequest, proxyApiRequest } from '@/lib/api-route';

type Context = { params: Promise<{ id: string; entryId: string }> };

async function path(context: Context) {
  const { id, entryId } = await context.params;
  return `/attendance-sites/${encodeURIComponent(id)}/calendar/holidays/${encodeURIComponent(entryId)}`;
}

export async function PATCH(request: Request, context: Context) {
  return proxyApiJsonBodyRequest(request, await path(context), 'PATCH', 'Impossible de modifier le jour férié du site.');
}

export async function DELETE(_request: Request, context: Context) {
  return proxyApiRequest(await path(context), { method: 'DELETE' }, 'Impossible de supprimer le jour férié du site.');
}
