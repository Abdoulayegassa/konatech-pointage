import { getPublicAppUrl } from './api';
import { NextResponse } from 'next/server';
import { proxyApiJsonBodyRequest, type IdRouteContext } from './api-route';

export async function proxyReconciliationDecision(
  request: Request,
  context: IdRouteContext,
  decision: 'approve' | 'reject',
) {
  // The backend uses Bearer credentials. This cookie-based BFF additionally
  // requires same-origin browser writes before forwarding an account session.
  const appOrigin = new URL(getPublicAppUrl() ?? request.url).origin;
  if (request.headers.get('origin') !== appOrigin) {
    return NextResponse.json(
      { error: 'Origine de requête non autorisée.' },
      { status: 403 },
    );
  }
  const { id } = await context.params;
  const response = await proxyApiJsonBodyRequest(
    request,
    `/attendance/offline-reconciliation/${encodeURIComponent(id)}/${decision}`,
    'POST',
    'Impossible de décider cette réconciliation.',
  );
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
