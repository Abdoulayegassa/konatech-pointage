type AttendanceSecurityPayload = {
  evidenceCapturedAt?: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  verificationPhotoDataUrl?: string;
  evidenceId?: string;
};

export type OfflineAttendanceState =
  | 'pending'
  | 'syncing'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'reconciliation-required';

export type OfflineAttendanceItem = {
  clientRequestId: string;
  /** Durable causal order; capturedAt remains business event time only. */
  sequence?: number;
  /** Opaque server-derived session value; never an employee or tenant ID. */
  sessionBinding: string;
  action: 'check-in' | 'check-out';
  siteId?: string;
  capturedAt: string;
  contextToken?: string;
  queuedAt?: string;
  state: OfflineAttendanceState;
  attempts: number;
  nextAttemptAt?: string;
  notes?: string;
  security?: AttendanceSecurityPayload;
  receivedAt?: string;
  /** Durable server intake acknowledged; never inferred from a local error. */
  serverAcknowledged?: boolean;
  finalizedAt?: string;
  rejectionReason?: string;
  reconciliationStatus?: 'RESOLVED' | 'REJECTED' | 'EXPIRED';
  reconciliationDecidedAt?: string;
};

const STORAGE_KEY = 'konatech:offline-attendance:v1';
const BASE_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;
export const OFFLINE_ATTENDANCE_QUEUE_RETENTION_MS = 24 * 60 * 60_000;
export const OFFLINE_ATTENDANCE_TERMINAL_RETENTION_MS = 24 * 60 * 60_000;

export const OFFLINE_ATTENDANCE_QUEUE_EVENT =
  'konatech:offline-attendance-queue-changed';
const OFFLINE_CONTEXT_STORAGE_KEY = 'konatech:offline-attendance-context:v1';
const OFFLINE_BOOTSTRAP_ACTIVE_KEY = 'konatech:offline-attendance:bootstrap:active:v1';
const OFFLINE_BOOTSTRAP_PREFIX = 'konatech:offline-attendance:bootstrap:v1:';
const PROCESSOR_LEASE_MS = 30_000;
const activeProcessors = new Map<string, Promise<OfflineAttendanceItem[]>>();
const activeProcessorOwners = new Map<string, string>();

export function storeOfflineAttendanceContext(storage: Storage, token: string) {
  storage.setItem(OFFLINE_CONTEXT_STORAGE_KEY, token);
}

export function readOfflineAttendanceContext(storage: Storage) {
  const bootstrap = readActiveOfflineAttendanceBootstrap(storage);
  if (bootstrap?.contextToken) return bootstrap.contextToken;
  return storage.getItem(OFFLINE_CONTEXT_STORAGE_KEY);
}

export type OfflineAttendanceBootstrap = {
  version: 1;
  employeeId: string;
  organizationId: string;
  employeeName: string;
  sessionBinding: string;
  siteId: string;
  siteName: string;
  canCheckIn: boolean;
  canCheckOut: boolean;
  timeZone?: string;
  securityPolicy: {
    enabled: boolean;
    selfieRequired: boolean;
    gpsRequired: boolean;
    locationConfigured: boolean;
    trustedRadiusMeters?: number | null;
    warningRadiusMeters?: number | null;
    allowedRadiusMeters: number | null;
    maxAccuracyMeters?: number | null;
    companyLatitude: number | null;
    companyLongitude: number | null;
    siteId: string;
    siteName: string;
  };
  contextToken: string;
  contextIssuedAt: string;
  contextValidUntil: string;
  snapshotAt: string;
};

export function deriveOfflineAttendanceActions(
  bootstrap: OfflineAttendanceBootstrap,
  queue: OfflineAttendanceItem[],
) {
  let canCheckIn = bootstrap.canCheckIn;
  let canCheckOut = bootstrap.canCheckOut;
  let blocked = false;
  const relevant = queue.filter((item) => {
    const contextOwner = readOfflineContextClaims(item.contextToken);
    if (contextOwner) {
      return contextOwner.employeeId === bootstrap.employeeId &&
        contextOwner.organizationId === bootstrap.organizationId;
    }
    return item.sessionBinding === bootstrap.sessionBinding;
  });
  for (const item of relevant) {
    const queuedAt = Date.parse(item.queuedAt ?? item.capturedAt);
    if (item.state === 'accepted' && item.reconciliationStatus === 'RESOLVED') {
      const snapshotAt = Date.parse(bootstrap.snapshotAt);
      const decidedAt = Date.parse(item.reconciliationDecidedAt ?? '');
      if (!Number.isFinite(snapshotAt) || !Number.isFinite(decidedAt) || snapshotAt < decidedAt) {
        blocked = true;
        break;
      }
      continue;
    }
    if (item.state === 'accepted' && queuedAt < Date.parse(bootstrap.snapshotAt)) continue;
    if (item.state === 'rejected' || item.state === 'expired' || item.state === 'reconciliation-required') {
      blocked = true;
      break;
    }
    if (item.state !== 'pending' && item.state !== 'syncing' && item.state !== 'accepted') continue;
    if (item.action === 'check-in' && canCheckIn && !canCheckOut) {
      canCheckIn = false;
      canCheckOut = true;
    } else if (item.action === 'check-out' && canCheckOut && !canCheckIn) {
      canCheckOut = false;
      canCheckIn = true;
    } else {
      blocked = true;
      break;
    }
  }
  return { canCheckIn, canCheckOut, blocked };
}

/** Applies an employee-scoped server outcome without changing causal queue order. */
export function applyOfflineAttendanceReconciliationOutcome(
  storage: Storage,
  clientRequestId: string,
  outcome: { reviewStatus: 'RESOLVED' | 'REJECTED' | 'EXPIRED'; reason?: string | null; decidedAt: string },
  owner: { employeeId: string; organizationId: string; sessionBinding: string },
) {
  if (!Number.isFinite(Date.parse(outcome.decidedAt))) return false;
  const queue = readOfflineAttendanceQueue(storage);
  const index = queue.findIndex((item) => item.clientRequestId === clientRequestId);
  if (index < 0) return false;
  const item = queue[index];
  if (
    item.state !== 'reconciliation-required' || item.serverAcknowledged !== true ||
    !queueItemBelongsTo(item, owner, owner.sessionBinding)
  ) return false;
  const contextOwner = readOfflineContextClaims(item.contextToken);
  if (contextOwner && (contextOwner.employeeId !== owner.employeeId || contextOwner.organizationId !== owner.organizationId)) return false;
  const next = [...queue];
  next[index] = {
    ...item,
    state: outcome.reviewStatus === 'RESOLVED' ? 'accepted' : outcome.reviewStatus === 'EXPIRED' ? 'expired' : 'rejected',
    reconciliationStatus: outcome.reviewStatus,
    reconciliationDecidedAt: outcome.decidedAt,
    rejectionReason: outcome.reviewStatus === 'RESOLVED' ? undefined : outcome.reason ?? undefined,
    finalizedAt: outcome.decidedAt,
    nextAttemptAt: undefined,
    security: undefined,
  };
  writeQueue(storage, next);
  return true;
}

export function storeOfflineAttendanceBootstrap(
  storage: Storage,
  bootstrap: OfflineAttendanceBootstrap,
) {
  const claims = readOfflineContextClaims(bootstrap.contextToken);
  if (
    !claims ||
    claims.employeeId !== bootstrap.employeeId ||
    claims.organizationId !== bootstrap.organizationId ||
    claims.siteId !== bootstrap.siteId ||
    claims.issuedAt !== bootstrap.contextIssuedAt ||
    claims.validUntil !== bootstrap.contextValidUntil
  ) return false;
  const key = offlineBootstrapKey(bootstrap.organizationId, bootstrap.employeeId);
  storage.setItem(key, JSON.stringify(bootstrap));
  storage.setItem(OFFLINE_BOOTSTRAP_ACTIVE_KEY, key);
  storage.setItem(OFFLINE_CONTEXT_STORAGE_KEY, bootstrap.contextToken);
  return true;
}

export function readActiveOfflineAttendanceBootstrap(storage: Storage) {
  try {
    const key = storage.getItem(OFFLINE_BOOTSTRAP_ACTIVE_KEY);
    if (!key?.startsWith(OFFLINE_BOOTSTRAP_PREFIX)) return null;
    const bootstrap = JSON.parse(storage.getItem(key) ?? 'null') as OfflineAttendanceBootstrap | null;
    if (
      !bootstrap ||
      bootstrap.version !== 1 ||
      offlineBootstrapKey(bootstrap.organizationId, bootstrap.employeeId) !== key ||
      !bootstrap.employeeId || !bootstrap.organizationId || !bootstrap.siteId ||
      !bootstrap.sessionBinding || !bootstrap.contextToken ||
      typeof bootstrap.canCheckIn !== 'boolean' || typeof bootstrap.canCheckOut !== 'boolean' ||
      !bootstrap.securityPolicy ||
      !readOfflineContextClaims(bootstrap.contextToken)
    ) return null;
    return bootstrap;
  } catch {
    return null;
  }
}

export function clearActiveOfflineAttendanceBootstrap(storage: Storage) {
  const key = storage.getItem(OFFLINE_BOOTSTRAP_ACTIVE_KEY);
  if (key?.startsWith(OFFLINE_BOOTSTRAP_PREFIX)) storage.removeItem(key);
  storage.removeItem(OFFLINE_BOOTSTRAP_ACTIVE_KEY);
  storage.removeItem(OFFLINE_CONTEXT_STORAGE_KEY);
}

export function offlineContextMatchesOwner(
  token: string | undefined,
  owner: { organizationId?: string; employeeId: string },
) {
  const claims = readOfflineContextClaims(token);
  return Boolean(
    claims &&
    claims.employeeId === owner.employeeId &&
    (!owner.organizationId || claims.organizationId === owner.organizationId),
  );
}

export function isOfflineContextValidForCapture(
  bootstrap: OfflineAttendanceBootstrap,
  capturedAt: Date,
) {
  const claims = readOfflineContextClaims(bootstrap.contextToken);
  const timestamp = capturedAt.getTime();
  const issuedAt = Date.parse(claims?.issuedAt ?? '');
  const validUntil = Date.parse(claims?.validUntil ?? '');
  return Boolean(
    claims &&
    offlineContextMatchesOwner(bootstrap.contextToken, bootstrap) &&
    claims.siteId === bootstrap.siteId &&
    Number.isFinite(issuedAt) &&
    Number.isFinite(validUntil) &&
    validUntil - issuedAt === OFFLINE_ATTENDANCE_QUEUE_RETENTION_MS &&
    timestamp >= issuedAt - 2 * 60_000 &&
    timestamp <= validUntil,
  );
}

function offlineBootstrapKey(organizationId: string, employeeId: string) {
  return `${OFFLINE_BOOTSTRAP_PREFIX}${encodeURIComponent(organizationId)}:${encodeURIComponent(employeeId)}`;
}

function readOfflineContextClaims(token?: string) {
  try {
    const encoded = token?.split('.')[1];
    if (!encoded) return null;
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const payload = JSON.parse(atob(padded));
    const context = payload.context;
    return payload.purpose === 'offline_attendance_context' &&
      typeof payload.sub === 'string' &&
      typeof context?.organizationId === 'string' &&
      typeof context?.siteId === 'string' &&
      typeof context?.issuedAt === 'string' &&
      typeof context?.validUntil === 'string'
      ? {
          employeeId: payload.sub,
          organizationId: context.organizationId,
          siteId: context.siteId,
          issuedAt: context.issuedAt,
          validUntil: context.validUntil,
          attendancePolicy: context.attendancePolicy,
          site: context.site,
          timeZone: context.timeZone,
        }
      : null;
  } catch {
    return null;
  }
}

export function getOfflineAttendanceContextBinding(token: string | undefined) {
  const claims = readOfflineContextClaims(token);
  return claims
    ? {
        employeeId: claims.employeeId,
        organizationId: claims.organizationId,
        siteId: claims.siteId,
        issuedAt: claims.issuedAt,
        validUntil: claims.validUntil,
        attendancePolicy: claims.attendancePolicy,
        site: claims.site,
        timeZone: claims.timeZone,
      }
    : null;
}

export function readOfflineAttendanceQueue(storage: Storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? (parsed as OfflineAttendanceItem[]).map((item, index) => ({
          ...item,
          sequence:
            Number.isSafeInteger(item.sequence) && (item.sequence ?? 0) > 0
              ? item.sequence
              : index + 1,
        }))
      : [];
  } catch {
    return [];
  }
}

export function enqueueOfflineAttendance(
  storage: Storage,
  input: Omit<OfflineAttendanceItem, 'clientRequestId' | 'state' | 'attempts' | 'sequence'>,
) {
  if (input.security?.verificationPhotoDataUrl && typeof indexedDB !== 'undefined') {
    throw new Error('Selfie evidence must be durably stored before queue metadata is written.');
  }
  return persistOfflineAttendanceQueueItem(storage, input);
}

export async function enqueueOfflineAttendanceWithEvidence(
  storage: Storage,
  input: Omit<OfflineAttendanceItem, 'clientRequestId' | 'state' | 'attempts' | 'sequence'>,
) {
  const photo = input.security?.verificationPhotoDataUrl;
  if (!photo) return persistOfflineAttendanceQueueItem(storage, input);
  const claims = readOfflineContextClaims(input.contextToken);
  if (!claims || !input.siteId || claims.siteId !== input.siteId) {
    throw new Error('A bound offline context is required for selfie evidence.');
  }
  const parsed = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(photo);
  if (!parsed) throw new Error('Offline selfie format is invalid.');
  const binary = atob(parsed[2]);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const { MAX_OFFLINE_SELFIE_BYTES, putOfflineEvidence } = await import('./offline-attendance-evidence-store');
  if (bytes.byteLength > MAX_OFFLINE_SELFIE_BYTES) throw new Error('Offline selfie exceeds the supported size.');
  const item: OfflineAttendanceItem = {
    ...input,
    security: { ...input.security, verificationPhotoDataUrl: undefined, evidenceId: crypto.randomUUID() },
    clientRequestId: crypto.randomUUID(),
    sequence: readOfflineAttendanceQueue(storage).reduce((max, queued) => Math.max(max, queued.sequence ?? 0), 0) + 1,
    queuedAt: new Date().toISOString(), state: 'pending', attempts: 0,
  };
  const evidenceId = item.security!.evidenceId!;
  await putOfflineEvidence({
    evidenceId, clientRequestId: item.clientRequestId, employeeId: claims.employeeId,
    organizationId: claims.organizationId, siteId: input.siteId, createdAt: item.queuedAt!,
    mimeType: parsed[1], size: bytes.byteLength, blob: new Blob([bytes], { type: parsed[1] }),
  });
  try {
    writeQueue(storage, [...readOfflineAttendanceQueue(storage), item]);
    return item;
  } catch (error) {
    const { deleteOfflineEvidence } = await import('./offline-attendance-evidence-store');
    await deleteOfflineEvidence(evidenceId).catch(() => undefined);
    throw error;
  }
}

function persistOfflineAttendanceQueueItem(
  storage: Storage,
  input: Omit<OfflineAttendanceItem, 'clientRequestId' | 'state' | 'attempts' | 'sequence'>,
) {
  const queue = readOfflineAttendanceQueue(storage);
  const item: OfflineAttendanceItem = {
    action: input.action,
    sessionBinding: input.sessionBinding,
    ...(input.siteId === undefined ? {} : { siteId: input.siteId }),
    capturedAt: input.capturedAt,
    ...(input.contextToken ? { contextToken: input.contextToken } : {}),
    queuedAt: new Date().toISOString(),
    ...(input.notes === undefined ? {} : { notes: input.notes }),
    ...(input.security === undefined
      ? {}
      : {
          security: {
            ...(input.security.evidenceCapturedAt === undefined
              ? {}
              : { evidenceCapturedAt: input.security.evidenceCapturedAt }),
            ...(input.security.latitude === undefined
              ? {}
              : { latitude: input.security.latitude }),
            ...(input.security.longitude === undefined
              ? {}
              : { longitude: input.security.longitude }),
            ...(input.security.accuracyMeters === undefined
              ? {}
              : { accuracyMeters: input.security.accuracyMeters }),
            ...(input.security.evidenceId === undefined ? {} : { evidenceId: input.security.evidenceId }),
          },
        }),
    clientRequestId: crypto.randomUUID(),
    sequence: queue.reduce((max, queued) => Math.max(max, queued.sequence ?? 0), 0) + 1,
    state: 'pending',
    attempts: 0,
  };
  writeQueue(storage, [...queue, item]);
  return item;
}

export async function synchronizeOfflineAttendanceQueue(
  storage: Storage,
  sessionBinding: string,
  submit: (item: OfflineAttendanceItem) => Promise<Response>,
  now: () => Date = () => new Date(),
  owner?: { organizationId?: string; employeeId: string },
) {
  const ownerKey = `${owner?.organizationId ?? 'legacy'}:${owner?.employeeId ?? sessionBinding}`;
  const queueLockKey = 'queue';
  const existing = activeProcessors.get(queueLockKey);
  if (existing) {
    if (activeProcessorOwners.get(queueLockKey) === ownerKey) return existing;
    await existing;
    return synchronizeOfflineAttendanceQueue(storage, sessionBinding, submit, now, owner);
  }
  const run = withProcessorLock(storage, queueLockKey, async () =>
    processQueue(storage, sessionBinding, submit, now, owner),
  );
  activeProcessors.set(queueLockKey, run);
  activeProcessorOwners.set(queueLockKey, ownerKey);
  try {
    return await run;
  } finally {
    if (activeProcessors.get(queueLockKey) === run) {
      activeProcessors.delete(queueLockKey);
      activeProcessorOwners.delete(queueLockKey);
    }
  }
}

async function processQueue(
  storage: Storage,
  sessionBinding: string,
  submit: (item: OfflineAttendanceItem) => Promise<Response>,
  now: () => Date,
  owner?: { organizationId?: string; employeeId: string },
) {
  const queue = cleanupOfflineAttendanceQueue(storage, now);
  if (typeof indexedDB !== 'undefined') {
    const { pruneUnreferencedOfflineEvidence } = await import('./offline-attendance-evidence-store');
    await pruneUnreferencedOfflineEvidence(new Set(queue.filter((item) => item.state !== 'accepted').map((item) => item.security?.evidenceId).filter((id): id is string => Boolean(id)))).catch(() => undefined);
  }
  for (const item of queue) {
    if (item.state !== 'expired' || !item.security) continue;
    if (item.security.evidenceId) {
      const { deleteOfflineEvidence } = await import('./offline-attendance-evidence-store');
      await deleteOfflineEvidence(item.security.evidenceId).catch(() => undefined);
    }
    updateItem(storage, item.clientRequestId, { security: undefined });
  }
  const currentTime = now().getTime();
  // The persisted array append order is the causal authority. sequence is a
  // durable ordinal for observability/migration and never overrides storage order.
  const ordered = queue
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => queueItemBelongsTo(item, owner, sessionBinding));

  for (const { item: queuedItem } of ordered) {
    let item = queuedItem;
    // Older queue versions classified auth failures as local review blockers.
    // Reauthentication may retry unacknowledged signed-context entries through
    // the normal secured API; durable server review stays authoritative.
    if (item.state === 'reconciliation-required' && !item.serverAcknowledged &&
        item.contextToken && item.sessionBinding !== sessionBinding) {
      if (currentTime - Date.parse(item.capturedAt) > OFFLINE_ATTENDANCE_QUEUE_RETENTION_MS) {
        updateItem(storage, item.clientRequestId, { state: 'expired', finalizedAt: now().toISOString(), nextAttemptAt: undefined,
          rejectionReason: 'Délai maximal de 24 heures dépassé. Ce pointage expiré ne peut pas être approuvé par réconciliation.' });
        break;
      }
      item = { ...item, state: 'pending', nextAttemptAt: undefined };
      updateItem(storage, item.clientRequestId, { state: 'pending', nextAttemptAt: undefined });
    }
    if (item.state === 'accepted') continue;
    // Every event in this employee queue is causally dependent on the
    // preceding unresolved event, including a later check-in.
    if (item.state === 'rejected' || item.state === 'expired' || item.state === 'reconciliation-required') break;
    if (item.state !== 'pending' && item.state !== 'syncing') break;
    if (item.nextAttemptAt && new Date(item.nextAttemptAt).getTime() > currentTime && item.sessionBinding === sessionBinding) break;
    if (item.contextToken && item.sessionBinding !== sessionBinding) updateItem(storage, item.clientRequestId, { sessionBinding, nextAttemptAt: undefined });
    if (item.sessionBinding !== sessionBinding && !item.contextToken) {
      updateItem(storage, item.clientRequestId, {
        state: 'reconciliation-required',
        rejectionReason: 'Ce pointage hors ligne appartient à une autre session et nécessite une réconciliation.',
        finalizedAt: now().toISOString(),
        nextAttemptAt: undefined,
      });
      break;
    }

    const attempts = item.attempts + 1;
    const nextAttemptAt = new Date(
      currentTime + retryDelayMilliseconds(attempts),
    ).toISOString();
    updateItem(storage, item.clientRequestId, {
      state: 'syncing',
      attempts,
      nextAttemptAt,
    });

    try {
      let submission = item;
      const evidenceId = item.security?.evidenceId;
      if (evidenceId) {
        const { getOfflineEvidence } = await import('./offline-attendance-evidence-store');
        const evidence = await getOfflineEvidence(evidenceId);
        const claims = readOfflineContextClaims(item.contextToken);
        if (!evidence || !claims || evidence.clientRequestId !== item.clientRequestId || evidence.employeeId !== claims.employeeId || evidence.organizationId !== claims.organizationId || evidence.siteId !== item.siteId) {
          updateItem(storage, item.clientRequestId, { state: 'reconciliation-required', rejectionReason: 'La preuve locale est absente ou ne correspond plus au pointage.' });
          break;
        }
        const bytes = new Uint8Array(await evidence.blob.arrayBuffer());
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        submission = { ...item, security: { ...item.security, verificationPhotoDataUrl: `data:${evidence.mimeType};base64,${btoa(binary)}` } };
      } else if (item.security?.verificationPhotoDataUrl && typeof indexedDB !== 'undefined') {
        // Backward compatibility for devices with v1 DataURL queue records.
        const claims = readOfflineContextClaims(item.contextToken);
        if (!claims || !item.siteId) {
          updateItem(storage, item.clientRequestId, { state: 'reconciliation-required', rejectionReason: 'La preuve locale ancienne ne peut pas être associée à un contexte valide.' });
          break;
        }
        const { putOfflineEvidence, MAX_OFFLINE_SELFIE_BYTES } = await import('./offline-attendance-evidence-store');
        const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(item.security.verificationPhotoDataUrl);
        if (!match) { updateItem(storage, item.clientRequestId, { state: 'reconciliation-required', rejectionReason: 'Le format de la preuve locale est invalide.' }); break; }
        const raw = atob(match[2]);
        const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
        if (bytes.byteLength > MAX_OFFLINE_SELFIE_BYTES) { updateItem(storage, item.clientRequestId, { state: 'reconciliation-required', rejectionReason: 'La preuve locale dépasse la taille acceptée.' }); break; }
        const migratedId = crypto.randomUUID();
        await putOfflineEvidence({ evidenceId: migratedId, clientRequestId: item.clientRequestId, employeeId: claims.employeeId, organizationId: claims.organizationId, siteId: item.siteId, createdAt: item.queuedAt ?? item.capturedAt, mimeType: match[1], size: bytes.byteLength, blob: new Blob([bytes], { type: match[1] }) });
        updateItem(storage, item.clientRequestId, { security: { ...item.security, verificationPhotoDataUrl: undefined, evidenceId: migratedId } });
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        submission = { ...item, security: { ...item.security, evidenceId: migratedId, verificationPhotoDataUrl: `data:${match[1]};base64,${btoa(binary)}` } };
      }
      // Evidence IDs belong to IndexedDB only; backend security DTOs reject
      // unknown fields. Keep the reference here for post-ack cleanup.
      const { evidenceId: _localEvidenceId, ...wireSecurity } = submission.security ?? {};
      const response = await submit({ ...submission, security: submission.security ? wireSecurity : undefined });
      const payload = (await response.json().catch(() => ({}))) as {
        receivedAt?: string;
        error?: string;
        state?: string;
        evidenceAcknowledged?: boolean;
      };
      if (payload.state === 'expired') {
        updateItem(storage, item.clientRequestId, {
          state: 'expired',
          rejectionReason: payload.error ?? 'Délai maximal de synchronisation dépassé.',
          finalizedAt: now().toISOString(),
          nextAttemptAt: undefined,
        });
        break;
      } else if (payload.state === 'reconciliation_required') {
        if (!response.ok || payload.evidenceAcknowledged !== true) { markRetryPending(storage, item.clientRequestId); break; }
        updateItem(storage, item.clientRequestId, {
          state: 'reconciliation-required',
          rejectionReason: payload.error ?? 'Ce pointage nécessite une réconciliation.',
          serverAcknowledged: true,
          security: undefined,
          finalizedAt: now().toISOString(),
          nextAttemptAt: undefined,
        });
        if (submission.security?.evidenceId) {
          const { deleteOfflineEvidence } = await import('./offline-attendance-evidence-store');
          await deleteOfflineEvidence(submission.security.evidenceId).catch(() => undefined);
        }
        break;
      } else if (response.ok && payload.state === 'accepted') {
        updateItem(storage, item.clientRequestId, {
          state: 'accepted',
          serverAcknowledged: true,
          receivedAt: payload.receivedAt,
          finalizedAt: now().toISOString(),
          security: undefined,
          nextAttemptAt: undefined,
        });
        if (submission.security?.evidenceId) {
          const { deleteOfflineEvidence } = await import('./offline-attendance-evidence-store');
          await deleteOfflineEvidence(submission.security.evidenceId).catch(() => undefined);
        }
      } else if (response.ok || response.status >= 500 || response.status === 429) {
        markRetryPending(storage, item.clientRequestId);
        break;
      } else if (response.status === 401 || response.status === 403) {
        updateItem(storage, item.clientRequestId, {
          state: 'pending',
          rejectionReason: payload.error ?? 'Reconnectez-vous pour réessayer ce pointage.',
        });
        break;
      } else if (
        response.status === 409 &&
        (payload.error ?? '').toLowerCase().includes('reconciliation')
      ) {
        updateItem(storage, item.clientRequestId, {
          state: 'reconciliation-required',
          rejectionReason: payload.error,
          finalizedAt: now().toISOString(),
          nextAttemptAt: undefined,
        });
        break;
      } else if (
        response.status === 400 &&
        (payload.error ?? '').toLowerCase().includes('offline attendance context')
      ) {
        updateItem(storage, item.clientRequestId, {
          state: 'reconciliation-required',
          rejectionReason: payload.error,
          finalizedAt: now().toISOString(),
          nextAttemptAt: undefined,
        });
        break;
      } else if (response.status === 410) {
        updateItem(storage, item.clientRequestId, {
          state: 'expired',
          rejectionReason: payload.error ?? 'Délai maximal de synchronisation dépassé.',
          finalizedAt: now().toISOString(),
          nextAttemptAt: undefined,
        });
        break;
      } else {
        const rejectedEvidenceId = submission.security?.evidenceId;
        updateItem(storage, item.clientRequestId, {
          state: 'rejected',
          rejectionReason: payload.error ?? 'Pointage hors ligne rejeté.',
          finalizedAt: now().toISOString(),
          security: undefined,
          nextAttemptAt: undefined,
        });
        if (rejectedEvidenceId) {
          const { deleteOfflineEvidence } = await import('./offline-attendance-evidence-store');
          await deleteOfflineEvidence(rejectedEvidenceId).catch(() => undefined);
        }
        break;
      }
    } catch {
      markRetryPending(storage, item.clientRequestId);
      break;
    }
  }

  return readOfflineAttendanceQueue(storage);
}

function queueItemBelongsTo(
  item: OfflineAttendanceItem,
  owner: { organizationId?: string; employeeId: string } | undefined,
  sessionBinding: string,
) {
  const contextOwner = readContextOwner(item.contextToken);
  if (contextOwner) {
    return Boolean(
      owner &&
      contextOwner.employeeId === owner.employeeId &&
      (!owner.organizationId || contextOwner.organizationId === owner.organizationId),
    );
  }
  return item.sessionBinding === sessionBinding;
}

function readContextOwner(token?: string) {
  try {
    const encoded = token?.split('.')[1];
    if (!encoded) return null;
    const payload = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')));
    const context = payload.context;
    return typeof payload.sub === 'string' && typeof context?.organizationId === 'string'
      ? { employeeId: payload.sub, organizationId: context.organizationId }
      : null;
  } catch {
    return null;
  }
}

async function withProcessorLock(
  storage: Storage,
  ownerKey: string,
  run: () => Promise<OfflineAttendanceItem[]>,
): Promise<OfflineAttendanceItem[]> {
  const lockName = `konatech:offline-attendance:${ownerKey}`;
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks) {
    return locks.request(lockName, () => run());
  }
  const leaseKey = `${lockName}:lease`;
  const leaseId = crypto.randomUUID();
  while (true) {
    try {
      const lease = JSON.parse(storage.getItem(leaseKey) ?? 'null') as { owner?: string; expiresAt?: number } | null;
      if (lease?.expiresAt && lease.expiresAt > Date.now()) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(500, lease.expiresAt! - Date.now())));
        continue;
      }
      storage.setItem(leaseKey, JSON.stringify({ owner: leaseId, expiresAt: Date.now() + PROCESSOR_LEASE_MS }));
      if (JSON.parse(storage.getItem(leaseKey) ?? 'null')?.owner !== leaseId) continue;
      break;
    } catch {
      // If storage cannot establish the lease, do not send requests without
      // cross-tab protection. The queue remains intact for a later trigger.
      return readOfflineAttendanceQueue(storage);
    }
  }
  const heartbeat = setInterval(() => {
    try {
      const lease = JSON.parse(storage.getItem(leaseKey) ?? 'null') as { owner?: string } | null;
      if (lease?.owner === leaseId) {
        storage.setItem(leaseKey, JSON.stringify({ owner: leaseId, expiresAt: Date.now() + PROCESSOR_LEASE_MS }));
      }
    } catch { /* A storage failure must not keep an in-memory lock alive. */ }
  }, Math.floor(PROCESSOR_LEASE_MS / 3));
  try { return await run(); }
  finally {
    clearInterval(heartbeat);
    try {
      const lease = JSON.parse(storage.getItem(leaseKey) ?? 'null') as { owner?: string } | null;
      if (lease?.owner === leaseId) storage.removeItem(leaseKey);
    } catch { /* The lease expires automatically if storage is unavailable. */ }
  }
}

export function cleanupOfflineAttendanceQueue(
  storage: Storage,
  now: () => Date = () => new Date(),
) {
  const currentTime = now().getTime();
  let changed = false;
  const queue = readOfflineAttendanceQueue(storage).flatMap((item) => {
    const eventTime = parseTimestamp(item.capturedAt);
    const finalizedAt = parseTimestamp(item.finalizedAt ?? item.receivedAt);

    if (
      item.state === 'accepted' &&
      finalizedAt !== null &&
      currentTime - finalizedAt >= OFFLINE_ATTENDANCE_TERMINAL_RETENTION_MS
    ) {
      changed = true;
      return [];
    }

    const queueExpired =
      eventTime !== null &&
      currentTime - eventTime > OFFLINE_ATTENDANCE_QUEUE_RETENTION_MS;

    if (
      (item.state === 'pending' || item.state === 'syncing') &&
      queueExpired
    ) {
      changed = true;
      return [
        {
          ...item,
          state: queueExpired ? 'expired' as const : 'reconciliation-required' as const,
          nextAttemptAt: undefined,
          finalizedAt: now().toISOString(),
          rejectionReason: 'Délai maximal de 24 heures dépassé. Ce pointage expiré ne peut pas être approuvé par réconciliation.',
        },
      ];
    }

    return [item];
  });

  if (changed) {
    writeQueue(storage, queue);
    return readOfflineAttendanceQueue(storage);
  }
  return queue;
}

function markRetryPending(storage: Storage, clientRequestId: string) {
  updateItem(storage, clientRequestId, { state: 'pending' });
}

function parseTimestamp(value: string | undefined) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function updateItem(
  storage: Storage,
  clientRequestId: string,
  patch: Partial<OfflineAttendanceItem>,
) {
  writeQueue(
    storage,
    readOfflineAttendanceQueue(storage).map((item) =>
      item.clientRequestId === clientRequestId ? { ...item, ...patch } : item,
    ),
  );
}

function writeQueue(storage: Storage, queue: OfflineAttendanceItem[]) {
  storage.setItem(STORAGE_KEY, JSON.stringify(queue));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OFFLINE_ATTENDANCE_QUEUE_EVENT));
  }
}

function retryDelayMilliseconds(attempt: number) {
  return Math.min(
    BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attempt - 1),
    MAX_RETRY_DELAY_MS,
  );
}
