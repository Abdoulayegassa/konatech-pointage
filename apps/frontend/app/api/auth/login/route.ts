import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  fetchServerApi,
  LoginResponse,
  OrganizationSelectionRequiredResponse,
  PlatformLoginResponse,
} from '@/lib/api';
import { createBackendFailureResponse } from '@/lib/api-route';
import { resolvePostLoginRedirect } from '@/lib/redirect';
import { normalizeRedirectTarget } from '@/lib/redirect';
import {
  ATTENDANCE_ENTRY_SESSION_COOKIE_NAME,
  ORGANIZATION_SELECTION_COOKIE_MAX_AGE,
  ORGANIZATION_SELECTION_COOKIE_NAME,
  ORGANIZATION_SELECTION_REDIRECT_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  buildSessionCookieOptions,
  clearSessionCookie,
} from '@/lib/auth-session';

type LoginErrorPayload = {
  message?: string | string[];
};

type BackendOrganizationSelectionResponse =
  OrganizationSelectionRequiredResponse & {
    organizationSelectionChallenge: string;
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

function getErrorMessage(
  payload:
    | LoginResponse
    | PlatformLoginResponse
    | OrganizationSelectionRequiredResponse
    | LoginErrorPayload,
) {
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

  let response: Response;

  try {
    response = await fetchServerApi('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // `redirectTo` is frontend navigation state, not part of Nest's LoginDto.
      body: JSON.stringify({
        email: payload.email,
        password: payload.password,
      }),
    });
  } catch (error) {
    return createBackendFailureResponse(error, 'Connexion impossible.');
  }

  const data = (await response.json().catch(() => ({}))) as
    | LoginResponse
    | PlatformLoginResponse
    | BackendOrganizationSelectionResponse
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

  if (
    'organizationSelectionRequired' in data &&
    data.organizationSelectionRequired
  ) {
    const cookieStore = await cookies();
    const safeRedirect = normalizeRedirectTarget(payload.redirectTo);

    clearSessionCookie(cookieStore, SESSION_COOKIE_NAME);
    clearSessionCookie(cookieStore, ORGANIZATION_SELECTION_COOKIE_NAME);
    clearSessionCookie(
      cookieStore,
      ORGANIZATION_SELECTION_REDIRECT_COOKIE_NAME,
    );
    cookieStore.set(
      ORGANIZATION_SELECTION_COOKIE_NAME,
      data.organizationSelectionChallenge,
      buildSessionCookieOptions(ORGANIZATION_SELECTION_COOKIE_MAX_AGE),
    );

    if (safeRedirect) {
      cookieStore.set(
        ORGANIZATION_SELECTION_REDIRECT_COOKIE_NAME,
        safeRedirect,
        buildSessionCookieOptions(ORGANIZATION_SELECTION_COOKIE_MAX_AGE),
      );
    }

    return NextResponse.json({
      organizationSelectionRequired: true,
      organizations: data.organizations.map(({ id, name, slug }) => ({
        id,
        name,
        slug,
      })),
    } satisfies OrganizationSelectionRequiredResponse);
  }

  if ('platformAdmin' in data && data.platformAdmin) {
    const platformSession = data as PlatformLoginResponse;
    const cookieStore = await cookies();

    clearSessionCookie(cookieStore, ATTENDANCE_ENTRY_SESSION_COOKIE_NAME);
    clearSessionCookie(cookieStore, ORGANIZATION_SELECTION_COOKIE_NAME);
    clearSessionCookie(
      cookieStore,
      ORGANIZATION_SELECTION_REDIRECT_COOKIE_NAME,
    );
    cookieStore.set(
      SESSION_COOKIE_NAME,
      platformSession.accessToken,
      buildSessionCookieOptions(toMaxAge(platformSession.expiresIn)),
    );

    return NextResponse.json({
      redirectTo: '/platform',
      platformAdmin: true,
    });
  }

  const session = data as LoginResponse;
  const cookieStore = await cookies();

  clearSessionCookie(cookieStore, ATTENDANCE_ENTRY_SESSION_COOKIE_NAME);
  clearSessionCookie(cookieStore, ORGANIZATION_SELECTION_COOKIE_NAME);
  clearSessionCookie(cookieStore, ORGANIZATION_SELECTION_REDIRECT_COOKIE_NAME);
  cookieStore.set(
    SESSION_COOKIE_NAME,
    session.accessToken,
    buildSessionCookieOptions(toMaxAge(session.expiresIn)),
  );

  return NextResponse.json({
    redirectTo: resolvePostLoginRedirect(
      session.user.accessRole,
      payload.redirectTo,
      session.membership?.role,
    ),
    user: session.user,
  });
}
