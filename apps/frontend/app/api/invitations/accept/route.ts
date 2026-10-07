import { NextResponse } from 'next/server';
import { createBackendFailureResponse } from '@/lib/api-route';
import { fetchServerApi } from '@/lib/api';

function errorMessage(payload: unknown) {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = payload.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }
  return "Impossible d'accepter l'invitation.";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  try {
    const response = await fetchServerApi('/invitations/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: errorMessage(payload) },
        { status: response.status },
      );
    }
    return NextResponse.json(
      { accepted: true, organization: payload.organization },
      {
        status: response.status,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    return createBackendFailureResponse(
      error,
      "Impossible d'accepter l'invitation.",
    );
  }
}
