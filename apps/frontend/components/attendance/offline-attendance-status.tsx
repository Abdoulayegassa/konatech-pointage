'use client';

import { useEffect, useState } from 'react';
import {
  cleanupOfflineAttendanceQueue,
  applyOfflineAttendanceReconciliationOutcome,
  getOfflineAttendanceContextBinding,
  offlineContextMatchesOwner,
  readActiveOfflineAttendanceBootstrap,
  readOfflineAttendanceQueue,
  storeOfflineAttendanceBootstrap,
  OFFLINE_ATTENDANCE_QUEUE_EVENT,
} from '@/lib/offline-attendance-queue';
import { loadOfflineAttendanceOutcomes, type OfflineAttendanceOutcome } from '@/lib/offline-attendance-outcomes';

type ReconciliationEntry = {
  clientRequestId: string;
  action: 'check-in' | 'check-out';
  capturedAt: string;
  rejectionReason?: string;
  outcome?: OfflineAttendanceOutcome;
};

function formatCapturedAt(value: string, timeZone?: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

export function OfflineAttendanceStatus() {
  const [counts, setCounts] = useState({
    pending: 0,
    syncing: 0,
    accepted: 0,
    rejected: 0,
    expired: 0,
    reconciliation: 0,
    rejectionReasons: [] as string[],
    reconciliationEntries: [] as ReconciliationEntry[],
    timeZone: undefined as string | undefined,
  });

  useEffect(() => {
    let active = true;
    let refreshing = false;
    let refreshRequested = false;
    let ownerKey = '';
    const outcomes = new Map<string, OfflineAttendanceOutcome>();

    const refresh = async () => {
      if (refreshing) {
        refreshRequested = true;
        return;
      }
      refreshing = true;
      try {
        const bootstrap = readActiveOfflineAttendanceBootstrap(window.localStorage);
        const currentOwnerKey = bootstrap
          ? `${bootstrap.organizationId}:${bootstrap.employeeId}`
          : '';
        if (ownerKey !== currentOwnerKey) {
          outcomes.clear();
          ownerKey = currentOwnerKey;
        }
        const allItems = bootstrap
          ? cleanupOfflineAttendanceQueue(window.localStorage)
          : [];
        const queue = bootstrap
          ? allItems.filter((item) =>
              item.contextToken
                ? offlineContextMatchesOwner(item.contextToken, bootstrap)
                : item.sessionBinding === bootstrap.sessionBinding,
            )
          : [];
        const reviewItems = queue.filter(
          (item) => item.state === 'reconciliation-required',
        );
        const idsToLoad = navigator.onLine
          ? reviewItems
              .filter((item) => {
                if (!item.serverAcknowledged) return false;
                const reviewStatus = outcomes.get(item.clientRequestId)?.reviewStatus;
                return reviewStatus !== 'RESOLVED' && reviewStatus !== 'REJECTED' && reviewStatus !== 'EXPIRED';
              })
              .map((item) => item.clientRequestId)
          : [];
        const fetched = idsToLoad.length
          ? await loadOfflineAttendanceOutcomes(idsToLoad)
          : new Map();
        for (const [id, outcome] of fetched) outcomes.set(id, outcome);
        if (bootstrap && navigator.onLine) {
          for (const item of reviewItems) {
            if (!item.serverAcknowledged) continue;
            const outcome = outcomes.get(item.clientRequestId);
            if (!outcome || !outcome.decidedAt || !['RESOLVED', 'REJECTED', 'EXPIRED'].includes(outcome.reviewStatus ?? '')) continue;
            if (outcome.reviewStatus === 'RESOLVED') {
              if (outcome.state.toLowerCase() !== 'resolved' || !outcome.attendanceId) continue;
              try {
                const [todayResponse, contextResponse] = await Promise.all([
                  fetch('/api/attendance/me/today', { cache: 'no-store' }),
                  fetch(`/api/attendance/me/offline-context?siteId=${encodeURIComponent(bootstrap.siteId)}`, { cache: 'no-store' }),
                ]);
                if (!todayResponse.ok || !contextResponse.ok) continue;
                const today = await todayResponse.json() as { canCheckIn?: unknown; canCheckOut?: unknown };
                const context = await contextResponse.json() as { contextToken?: unknown };
                if (typeof today.canCheckIn !== 'boolean' || typeof today.canCheckOut !== 'boolean' || typeof context.contextToken !== 'string') continue;
                const binding = getOfflineAttendanceContextBinding(context.contextToken);
                if (!binding || binding.employeeId !== bootstrap.employeeId || binding.organizationId !== bootstrap.organizationId || binding.siteId !== bootstrap.siteId || Date.parse(binding.issuedAt) < Date.parse(outcome.decidedAt)) continue;
                const policy = binding.attendancePolicy as Record<string, unknown> | undefined;
                const site = binding.site as Record<string, unknown> | undefined;
                const enabled = typeof policy?.enabled === 'boolean' ? policy.enabled : bootstrap.securityPolicy.enabled;
                const updated = storeOfflineAttendanceBootstrap(window.localStorage, {
                  ...bootstrap,
                  canCheckIn: today.canCheckIn,
                  canCheckOut: today.canCheckOut,
                  snapshotAt: binding.issuedAt,
                  contextToken: context.contextToken,
                  contextIssuedAt: binding.issuedAt,
                  contextValidUntil: binding.validUntil,
                  timeZone: binding.timeZone ?? bootstrap.timeZone,
                  securityPolicy: {
                    ...bootstrap.securityPolicy,
                    enabled,
                    selfieRequired: typeof policy?.selfieRequired === 'boolean' ? policy.selfieRequired : bootstrap.securityPolicy.selfieRequired,
                    gpsRequired: typeof policy?.gpsRequired === 'boolean' ? policy.gpsRequired : bootstrap.securityPolicy.gpsRequired,
                    locationConfigured: typeof policy?.locationConfigured === 'boolean' ? policy.locationConfigured : bootstrap.securityPolicy.locationConfigured,
                    allowedRadiusMeters: typeof site?.allowedRadiusMeters === 'number' ? site.allowedRadiusMeters : bootstrap.securityPolicy.allowedRadiusMeters,
                    companyLatitude: typeof site?.latitude === 'number' ? site.latitude : bootstrap.securityPolicy.companyLatitude,
                    companyLongitude: typeof site?.longitude === 'number' ? site.longitude : bootstrap.securityPolicy.companyLongitude,
                  },
                });
                if (!updated) continue;
              } catch {
                // Keep the acknowledged event blocking until an authoritative refresh succeeds.
                continue;
              }
            }
            applyOfflineAttendanceReconciliationOutcome(
              window.localStorage,
              item.clientRequestId,
              { reviewStatus: outcome.reviewStatus as 'RESOLVED' | 'REJECTED' | 'EXPIRED', reason: outcome.decisionReason ?? outcome.reason, decidedAt: outcome.decidedAt },
              { employeeId: bootstrap.employeeId, organizationId: bootstrap.organizationId, sessionBinding: bootstrap.sessionBinding },
            );
          }
        }
        if (!active) return;
        const updatedQueue = bootstrap
          ? readOfflineAttendanceQueue(window.localStorage).filter((item) =>
              item.contextToken
                ? offlineContextMatchesOwner(item.contextToken, bootstrap)
                : item.sessionBinding === bootstrap.sessionBinding,
            )
          : [];
        const durableOutcomeItems = updatedQueue.filter((item) =>
          item.state === 'reconciliation-required' || item.reconciliationStatus,
        );
        const reconciliationEntries = durableOutcomeItems.map((item) => ({
          clientRequestId: item.clientRequestId,
          action: item.action,
          capturedAt: item.capturedAt,
          rejectionReason: item.rejectionReason,
          outcome: outcomes.get(item.clientRequestId) ?? (item.reconciliationStatus ? {
            state: item.reconciliationStatus === 'RESOLVED' ? 'resolved' : item.reconciliationStatus === 'EXPIRED' ? 'expired' : 'rejected',
            reviewStatus: item.reconciliationStatus,
            decidedAt: item.reconciliationDecidedAt,
            reason: item.rejectionReason ?? null,
          } : undefined),
        }));
        setCounts({
          pending: queue.filter(({ state }) => state === 'pending').length,
          syncing: queue.filter(({ state }) => state === 'syncing').length,
          accepted: queue.filter(({ state }) => state === 'accepted').length,
          rejected: queue.filter(({ state }) => state === 'rejected').length,
          expired: queue.filter(({ state }) => state === 'expired').length,
          reconciliation: durableOutcomeItems.length,
          rejectionReasons: queue
            .filter(({ state }) => state === 'rejected' && state)
            .map(({ rejectionReason }) => rejectionReason)
            .filter((reason): reason is string => Boolean(reason))
            .slice(0, 3),
          reconciliationEntries,
          timeZone: bootstrap?.timeZone,
        });
      } finally {
        refreshing = false;
        if (active && refreshRequested) {
          refreshRequested = false;
          void refresh();
        }
      }
    };
    void refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener(OFFLINE_ATTENDANCE_QUEUE_EVENT, refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    window.addEventListener('focus', refresh);
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') void refresh();
    }, 60_000);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      window.removeEventListener('storage', refresh);
      window.removeEventListener(OFFLINE_ATTENDANCE_QUEUE_EVENT, refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  if (
    counts.pending === 0 &&
    counts.syncing === 0 &&
    counts.accepted === 0 &&
    counts.rejected === 0
    && counts.expired === 0
    && counts.reconciliation === 0
  ) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      {counts.pending > 0 ? (
        <p className="font-bold">
          {counts.pending} pointage{counts.pending > 1 ? 's' : ''} en attente —
          non validé{counts.pending > 1 ? 's' : ''} par le serveur.
        </p>
      ) : null}
      {counts.syncing > 0 ? (
        <p className="mt-1 font-bold">
          Synchronisation de {counts.syncing} pointage
          {counts.syncing > 1 ? 's' : ''} en cours…
        </p>
      ) : null}
      {counts.accepted > 0 ? (
        <p className="mt-1 font-semibold text-emerald-800">
          {counts.accepted} pointage{counts.accepted > 1 ? 's' : ''} hors ligne{' '}
          validé{counts.accepted > 1 ? 's' : ''} par le serveur.
        </p>
      ) : null}
      {counts.rejected > 0 ? (
        <p className="mt-1 font-semibold">
          {counts.rejected} synchronisation
          {counts.rejected > 1 ? 's rejetées' : ' rejetée'}.
        </p>
      ) : null}
      {counts.expired > 0 ? (
        <p className="mt-1 font-semibold">{counts.expired} pointage{counts.expired > 1 ? 's expirés' : ' expiré'}.</p>
      ) : null}
      {counts.reconciliation > 0 ? (
        <div className="mt-2 space-y-2" aria-live="polite">
          {counts.reconciliationEntries.map(({ clientRequestId, action, capturedAt, rejectionReason, outcome }) => {
            const stamp = formatCapturedAt(outcome?.capturedAt ?? capturedAt, counts.timeZone);
            const actionLabel = action === 'check-in' ? 'Entrée' : 'Sortie';
            const reviewStatus = outcome?.reviewStatus;
            return (
              <p className="border-t border-amber-200 pt-2 font-semibold" key={clientRequestId}>
                {reviewStatus === 'RESOLVED'
                  ? `${actionLabel} du ${stamp} validée après vérification administrative.`
                  : reviewStatus === 'REJECTED'
                    ? `${actionLabel} du ${stamp} rejetée après vérification administrative.${outcome?.reason ? ` Motif : ${outcome.reason}` : ''}`
                    : reviewStatus === 'PENDING_REVIEW'
                      ? `${actionLabel} du ${stamp} en attente de vérification administrative.`
                      : rejectionReason ?? `${actionLabel} du ${stamp} transmis pour vérification; résultat serveur en attente.`}
                {outcome?.decidedAt ? <span className="mt-1 block text-xs font-normal">Décision le {formatCapturedAt(outcome.decidedAt, counts.timeZone)}</span> : null}
              </p>
            );
          })}
        </div>
      ) : null}
      {counts.rejectionReasons.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
          {counts.rejectionReasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
