import { proxyApiRequest } from '@/lib/api-route';
import { ATTENDANCE_ENTRY_SESSION_COOKIE_NAME } from '@/lib/auth-session';

export async function GET(
  request: Request,
  context: { params: Promise<{ clientRequestId: string }> },
) {
  const { clientRequestId } = await context.params;
  const hasEntrySession = request.headers
    .get('cookie')
    ?.split(';')
    .some((cookie) =>
      cookie.trim().startsWith(ATTENDANCE_ENTRY_SESSION_COOKIE_NAME + '='),
    );
  const response = await proxyApiRequest(
    `/attendance/me/offline-reconciliation/${encodeURIComponent(clientRequestId)}`,
    { method: 'GET' },
    'Impossible de charger le résultat du pointage.',
    { sessionMode: hasEntrySession ? 'attendance-entry' : 'default' },
  );
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
