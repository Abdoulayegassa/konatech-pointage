import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth-session';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtectedPath =
    pathname === '/' ||
    pathname.startsWith('/my-attendance') ||
    pathname.startsWith('/employees') ||
    pathname.startsWith('/schedules');
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (isProtectedPath && !hasSession) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/my-attendance/:path*',
    '/employees/:path*',
    '/schedules/:path*',
  ],
};
