import { proxyApiRequest } from '@/lib/api-route';
import { ATTENDANCE_ENTRY_SESSION_COOKIE_NAME } from '@/lib/auth-session';

export async function GET(request: Request) {
  const requestedMode = new URL(request.url).searchParams.get('authMode');
  const hasAttendanceEntryCookie = request.headers
    .get('cookie')
    ?.split(';')
    .some((cookie) => cookie.trim().startsWith(ATTENDANCE_ENTRY_SESSION_COOKIE_NAME + '='));
  const sessionMode = requestedMode === 'attendance-entry' || (!requestedMode && hasAttendanceEntryCookie)
    ? 'attendance-entry'
    : 'default';
  const response = await proxyApiRequest(
    '/attendance/me/today',
    { method: 'GET' },
    'Impossible de rafraîchir le pointage du jour.',
    { sessionMode },
  );
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
