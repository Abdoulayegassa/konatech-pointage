import { NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/api';

const fallbackMessage = 'Impossible de joindre le backend.';

function readErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !('message' in payload)) {
    return fallbackMessage;
  }

  const message = payload.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  return typeof message === 'string' ? message : fallbackMessage;
}

export async function GET() {
  const response = await fetch(`${getApiBaseUrl()}/health`, {
    method: 'GET',
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    return NextResponse.json(
      {
        error: readErrorMessage(payload),
      },
      {
        status: response.status,
      },
    );
  }

  return NextResponse.json(payload, {
    status: response.status,
  });
}
