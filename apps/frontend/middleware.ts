import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth-session';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // This route is a public, data-free shell. Attendance still requires the
  // employee and tenant bound server-issued context stored on this device.
  if (pathname === '/my-attendance/offline') {
    return NextResponse.next();
  }
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set(
      'redirectTo',
      `${pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/dashboard/:path*',
    '/organization/:path*',
    '/sites/:path*',
    '/site/:path*',
    '/my-attendance/:path*',
    '/employees/:path*',
    '/schedules/:path*',
    '/attendance-history/:path*',
    '/attendance-sites/:path*',
    '/calendar/:path*',
    '/exports/:path*',
    '/sanctions/:path*',
    '/organization-settings/:path*',
    '/subscription/:path*',
    '/platform/:path*',
  ],
};
