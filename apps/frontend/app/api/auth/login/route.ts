import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getApiBaseUrl, LoginResponse } from '@/lib/api';
import { resolvePostLoginRedirect } from '@/lib/redirect';
import {
  ATTENDANCE_ENTRY_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  buildSessionCookieOptions,
  clearSessionCookie,
} from '@/lib/auth-session';

type LoginErrorPayload = {
  message?: string | string[];
};

function toMaxAge(expiresIn: string) {
  if (/^\d+$/.test(expiresIn)) {
    return Number(expiresIn);
  }

  const match = expiresIn.match(/^(\d+)([smhd])$/);

  if (!match) {
    return 60 * 60 * 24;
  }

  const [, amount, rawUnit] = match;
  const unit = rawUnit as 's' | 'm' | 'h' | 'd';
  const multiplierByUnit = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 60 * 60 * 24,
  } as const;
  const multiplier = multiplierByUnit[unit];

  return Number(amount) * multiplier;
}

function getErrorMessage(payload: LoginResponse | LoginErrorPayload) {
  if ('message' in payload) {
    return Array.isArray(payload.message)
      ? payload.message.join(', ')
      : (payload.message ?? 'Connexion impossible.');
  }

  return 'Connexion impossible.';
}

export async function POST(request: Request) {
  const payload = (await request.json()) as {
    email?: string;
    password?: string;
    redirectTo?: string;
  };

  const response = await fetch(`${getApiBaseUrl()}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const data = (await response.json().catch(() => ({}))) as
    | LoginResponse
    | LoginErrorPayload;

  if (!response.ok) {
    return NextResponse.json(
      {
        error: getErrorMessage(data),
      },
      {
        status: response.status,
      },
    );
  }

  const session = data as LoginResponse;
  const cookieStore = await cookies();

  clearSessionCookie(cookieStore, ATTENDANCE_ENTRY_SESSION_COOKIE_NAME);
  cookieStore.set(
    SESSION_COOKIE_NAME,
    session.accessToken,
    buildSessionCookieOptions(toMaxAge(session.expiresIn)),
  );

  return NextResponse.json({
    redirectTo: resolvePostLoginRedirect(
      session.user.accessRole,
      payload.redirectTo,
    ),
    user: session.user,
  });
}
