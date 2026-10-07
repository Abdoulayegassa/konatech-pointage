export type OfflineAttendanceOutcome = {
  state: string;
  reviewStatus: 'PENDING_REVIEW' | 'RESOLVED' | 'REJECTED' | 'EXPIRED' | null;
  action?: string;
  capturedAt?: string;
  reason?: string | null;
  decidedAt?: string | null;
  attendanceId?: string | null;
  decisionReason?: string | null;
};

/** Loads retained server outcomes without allowing a long local queue to fan out requests. */
export async function loadOfflineAttendanceOutcomes(
  clientRequestIds: string[],
  request: (clientRequestId: string) => Promise<Response> = (clientRequestId) =>
    fetch(`/api/attendance/me/offline-reconciliation/${encodeURIComponent(clientRequestId)}`, {
      cache: 'no-store',
    }),
  concurrency = 3,
): Promise<Map<string, OfflineAttendanceOutcome>> {
  const ids = [...new Set(clientRequestIds)];
  const outcomes = new Map<string, OfflineAttendanceOutcome>();
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < ids.length) {
      const clientRequestId = ids[nextIndex++];
      try {
        const response = await request(clientRequestId);
        if (!response.ok) continue;
        const value = (await response.json()) as Partial<OfflineAttendanceOutcome>;
        if (
          typeof value.state === 'string' &&
          (value.reviewStatus === null ||
            value.reviewStatus === 'PENDING_REVIEW' ||
            value.reviewStatus === 'RESOLVED' ||
            value.reviewStatus === 'REJECTED' ||
            value.reviewStatus === 'EXPIRED')
        ) {
          outcomes.set(clientRequestId, {
            state: value.state,
            reviewStatus: value.reviewStatus,
            action: typeof value.action === 'string' ? value.action : undefined,
            capturedAt: typeof value.capturedAt === 'string' ? value.capturedAt : undefined,
            reason: typeof value.reason === 'string' ? value.reason : null,
            decidedAt: typeof value.decidedAt === 'string' ? value.decidedAt : null,
            attendanceId: typeof value.attendanceId === 'string' ? value.attendanceId : null,
            decisionReason: typeof value.decisionReason === 'string' ? value.decisionReason : null,
          });
        }
      } catch {
        // An unavailable lookup leaves the local acknowledged state visible for retry.
      }
    }
  }

  const workerCount = Math.min(ids.length, Math.max(1, Math.floor(concurrency)));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return outcomes;
}
