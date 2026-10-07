import { proxyApiRequest } from '@/lib/api-route';
import { ATTENDANCE_ENTRY_SESSION_COOKIE_NAME } from '@/lib/auth-session';

export async function GET(request: Request) {
  const siteId = new URL(request.url).searchParams.get('siteId');
  const path = siteId
    ? `/attendance/me/offline-context?siteId=${encodeURIComponent(siteId)}`
    : '/attendance/me/offline-context';
  const requestedMode = new URL(request.url).searchParams.get('authMode');
  const hasAttendanceEntryCookie = request.headers
    .get('cookie')
    ?.split(';')
    .some((cookie) => cookie.trim().startsWith(ATTENDANCE_ENTRY_SESSION_COOKIE_NAME + '='));
  const sessionMode =
    requestedMode === 'attendance-entry' ||
    (!requestedMode && hasAttendanceEntryCookie)
      ? 'attendance-entry'
      : 'default';
  const response = await proxyApiRequest(
    path,
    { method: 'GET' },
    'Impossible de préparer le pointage hors ligne.',
    { sessionMode },
  );
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
