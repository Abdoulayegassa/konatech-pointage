import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getApiBaseUrl, LoginResponse } from '@/lib/api';
import {
  ATTENDANCE_ENTRY_SESSION_COOKIE_NAME,
  buildSessionCookieOptions,
  clearSessionCookie,
} from '@/lib/auth-session';

type AttendanceEntryLoginErrorPayload = {
  message?: string | string[];
};

function toMaxAge(expiresIn: string) {
  if (/^\d+$/.test(expiresIn)) {
    return Number(expiresIn);
  }

  const match = expiresIn.match(/^(\d+)([smhd])$/);

  if (!match) {
    return 60 * 15;
  }

  const [, amount, rawUnit] = match;
  const unit = rawUnit as 's' | 'm' | 'h' | 'd';
  const multiplierByUnit = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 60 * 60 * 24,
  } as const;

  return Number(amount) * multiplierByUnit[unit];
}

function getErrorMessage(
  payload: LoginResponse | AttendanceEntryLoginErrorPayload,
) {
  if ('message' in payload) {
    return Array.isArray(payload.message)
      ? payload.message.join(', ')
      : (payload.message ?? 'Impossible de verifier ce code.');
  }

  return 'Impossible de verifier ce code.';
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as {
    pinCode?: string;
  };

  const response = await fetch(`${getApiBaseUrl()}/auth/attendance-entry/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const data = (await response.json().catch(() => ({}))) as
    | LoginResponse
    | AttendanceEntryLoginErrorPayload;

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
    ATTENDANCE_ENTRY_SESSION_COOKIE_NAME,
    session.accessToken,
    buildSessionCookieOptions(toMaxAge(session.expiresIn)),
  );

  return NextResponse.json({
    redirectTo: '/attendance-entry',
    user: session.user,
  });
}

export async function DELETE() {
  clearSessionCookie(
    await cookies(),
    ATTENDANCE_ENTRY_SESSION_COOKIE_NAME,
  );

  return NextResponse.json({
    success: true,
  });
}
