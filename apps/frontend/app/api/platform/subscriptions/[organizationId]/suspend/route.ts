import { proxyApiRequest } from '@/lib/api-route';
import { NextResponse } from 'next/server';
export async function POST(
  _: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(organizationId))
    return NextResponse.json(
      { error: 'Identifiant invalide.' },
      { status: 400 },
    );
  return proxyApiRequest(
    `/platform/subscriptions/${organizationId}/suspend`,
    { method: 'POST' },
    'Suspension impossible.',
  );
}
