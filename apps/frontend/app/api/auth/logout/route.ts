import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getPublicAppUrl } from '@/lib/api';
import {
  ATTENDANCE_ENTRY_SESSION_COOKIE_NAME,
  ORGANIZATION_SELECTION_COOKIE_NAME,
  ORGANIZATION_SELECTION_REDIRECT_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  clearSessionCookie,
} from '@/lib/auth-session';

export async function POST(request: Request) {
  const cookieStore = await cookies();

  clearSessionCookie(cookieStore, SESSION_COOKIE_NAME);
  clearSessionCookie(cookieStore, ATTENDANCE_ENTRY_SESSION_COOKIE_NAME);
  clearSessionCookie(cookieStore, ORGANIZATION_SELECTION_COOKIE_NAME);
  clearSessionCookie(cookieStore, ORGANIZATION_SELECTION_REDIRECT_COOKIE_NAME);

  return NextResponse.redirect(
    new URL('/login', getPublicAppUrl() ?? request.url),
  );
}
