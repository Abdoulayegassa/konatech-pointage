import { NextResponse } from 'next/server';
import { proxyApiJsonBodyRequest, proxyApiRequest } from '@/lib/api-route';

export async function GET() {
  return proxyApiRequest(
    '/organizations/current/invitations',
    { method: 'GET' },
    'Impossible de charger les invitations.',
  );
}

export async function POST(request: Request) {
  const response = await proxyApiJsonBodyRequest(
    request,
    '/organizations/current/invitations',
    'POST',
    "Impossible de créer l'invitation.",
  );
  if (!response.ok) return response;

  const payload = (await response.json()) as {
    invitation?: unknown;
    invitationToken?: string;
  };
  return NextResponse.json(
    {
      invitation: payload.invitation,
      invitationToken: payload.invitationToken,
    },
    {
      status: response.status,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
