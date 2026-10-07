import { proxyReconciliationDecision } from '@/lib/reconciliation-api-route';
import type { IdRouteContext } from '@/lib/api-route';

export async function POST(request: Request, context: IdRouteContext) {
  return proxyReconciliationDecision(request, context, 'reject');
}
