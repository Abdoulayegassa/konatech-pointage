export const SESSION_COOKIE_NAME = 'konatech_session';
export const ATTENDANCE_ENTRY_SESSION_COOKIE_NAME =
  'konatech_attendance_entry_session';

export type SessionCookieMode = 'default' | 'attendance-entry';

type SessionCookieValues = {
  attendanceEntrySessionToken?: string | null;
  sessionToken?: string | null;
};

export function resolveSessionToken(
  values: SessionCookieValues,
  mode: SessionCookieMode = 'default',
) {
  if (mode === 'attendance-entry') {
    return values.attendanceEntrySessionToken ?? null;
  }

  return values.sessionToken ?? null;
}

export function buildSessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

export function clearSessionCookie(
  cookieStore: {
    set: (
      name: string,
      value: string,
      options: ReturnType<typeof buildSessionCookieOptions>,
    ) => void;
    delete: (name: string) => void;
  },
  cookieName: string,
) {
  cookieStore.delete(cookieName);
  cookieStore.set(cookieName, '', buildSessionCookieOptions(0));
}
