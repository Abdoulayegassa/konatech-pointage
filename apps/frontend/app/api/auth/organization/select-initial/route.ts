import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { fetchServerApi, LoginResponse } from '@/lib/api';
import { createBackendFailureResponse } from '@/lib/api-route';
import {
  ORGANIZATION_SELECTION_COOKIE_NAME,
  ORGANIZATION_SELECTION_REDIRECT_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  buildSessionCookieOptions,
  clearSessionCookie,
} from '@/lib/auth-session';
import { resolvePostLoginRedirect } from '@/lib/redirect';

type SelectionErrorPayload = {
  message?: string | string[];
};

function includesMessage(payload: SelectionErrorPayload, value: string) {
  const message = Array.isArray(payload.message)
    ? payload.message.join(' ')
    : payload.message;

  return typeof message === 'string' && message.includes(value);
}

function isExpiredChallenge(challenge: string) {
  try {
    const encodedPayload = challenge.split('.')[1];
    if (!encodedPayload) return false;

    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as { exp?: unknown };

    return (
      typeof payload.exp === 'number' &&
      payload.exp <= Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}

function toMaxAge(expiresIn: string) {
  if (/^\d+$/.test(expiresIn)) {
    return Number(expiresIn);
  }

  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) {
    return 60 * 60 * 24;
  }

  const multiplierByUnit = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 60 * 60 * 24,
  } as const;

  return (
    Number(match[1]) *
    multiplierByUnit[match[2] as keyof typeof multiplierByUnit]
  );
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const challenge = cookieStore.get(ORGANIZATION_SELECTION_COOKIE_NAME)?.value;

  if (!challenge) {
    return NextResponse.json(
      {
        error:
          'Votre session de connexion a expiré. Veuillez vous reconnecter.',
      },
      { status: 401 },
    );
  }

  const payload = (await request.json().catch(() => ({}))) as {
    organizationId?: unknown;
  };
  const organizationId =
    typeof payload.organizationId === 'string'
      ? payload.organizationId.trim()
      : '';

  if (!organizationId) {
    return NextResponse.json(
      { error: 'Veuillez choisir une organisation.' },
      { status: 400 },
    );
  }

  let response: Response;

  try {
    response = await fetchServerApi('/auth/organization/select-initial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge, organizationId }),
    });
  } catch (error) {
    return createBackendFailureResponse(
      error,
      'Impossible de sélectionner cette organisation.',
    );
  }

  const data = (await response.json().catch(() => ({}))) as
    | LoginResponse
    | SelectionErrorPayload;

  if (!response.ok) {
    if (response.status === 401) {
      clearSessionCookie(cookieStore, ORGANIZATION_SELECTION_COOKIE_NAME);
      clearSessionCookie(
        cookieStore,
        ORGANIZATION_SELECTION_REDIRECT_COOKIE_NAME,
      );
    }

    const challengeExpired =
      includesMessage(
        data as SelectionErrorPayload,
        'Invalid or expired organization-selection challenge',
      ) && isExpiredChallenge(challenge);

    return NextResponse.json(
      {
        error: challengeExpired
          ? 'Votre session de connexion a expiré. Veuillez vous reconnecter.'
          : 'Impossible de vous authentifier pour cette organisation.',
      },
      { status: response.status },
    );
  }

  const session = data as LoginResponse;
  const requestedRedirect = cookieStore.get(
    ORGANIZATION_SELECTION_REDIRECT_COOKIE_NAME,
  )?.value;

  clearSessionCookie(cookieStore, ORGANIZATION_SELECTION_COOKIE_NAME);
  clearSessionCookie(cookieStore, ORGANIZATION_SELECTION_REDIRECT_COOKIE_NAME);
  clearSessionCookie(cookieStore, SESSION_COOKIE_NAME);
  cookieStore.set(
    SESSION_COOKIE_NAME,
    session.accessToken,
    buildSessionCookieOptions(toMaxAge(session.expiresIn)),
  );

  return NextResponse.json({
    redirectTo: resolvePostLoginRedirect(
      session.user.accessRole,
      requestedRedirect,
      session.membership?.role,
    ),
    user: session.user,
  });
}
