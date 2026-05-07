import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  ATTENDANCE_ENTRY_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  clearSessionCookie,
} from '@/lib/auth-session';

export async function POST(request: Request) {
  const cookieStore = await cookies();

  clearSessionCookie(cookieStore, SESSION_COOKIE_NAME);
  clearSessionCookie(cookieStore, ATTENDANCE_ENTRY_SESSION_COOKIE_NAME);

  return NextResponse.redirect(new URL('/login', request.url));
}
