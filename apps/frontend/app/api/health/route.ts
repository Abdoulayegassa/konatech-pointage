import { NextResponse } from 'next/server';
import { fetchServerApi } from '@/lib/api';
import { createBackendFailureResponse } from '@/lib/api-route';

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
  let response: Response;

  try {
    response = await fetchServerApi('/health', {
      method: 'GET',
    });
  } catch (error) {
    return createBackendFailureResponse(error, fallbackMessage);
  }

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
