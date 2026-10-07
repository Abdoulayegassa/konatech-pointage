import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import {
  cleanupOfflineAttendanceQueue,
  applyOfflineAttendanceReconciliationOutcome,
  deriveOfflineAttendanceActions,
  enqueueOfflineAttendance,
  type OfflineAttendanceItem,
  OFFLINE_ATTENDANCE_QUEUE_RETENTION_MS,
  OFFLINE_ATTENDANCE_TERMINAL_RETENTION_MS,
  readOfflineAttendanceQueue,
  readActiveOfflineAttendanceBootstrap,
  storeOfflineAttendanceBootstrap,
  clearActiveOfflineAttendanceBootstrap,
  isOfflineContextValidForCapture,
  type OfflineAttendanceBootstrap,
  synchronizeOfflineAttendanceQueue,
} from '../../frontend/lib/offline-attendance-queue';
import { loadOfflineAttendanceOutcomes } from '../../frontend/lib/offline-attendance-outcomes';

function memoryStorage(values = new Map<string, string>()) {
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } as Storage;
}

const TEST_SESSION_BINDING = '0f205e79-48ae-469a-93a8-f8af87168e71';

function signedContext(employeeId = 'employee-a', organizationId = 'org-a', siteId = 'site-a', issuedAt = '2026-09-02T00:00:00.000Z') {
  const validUntil = new Date(Date.parse(issuedAt) + OFFLINE_ATTENDANCE_QUEUE_RETENTION_MS).toISOString();
  const payload = Buffer.from(JSON.stringify({
    purpose: 'offline_attendance_context',
    sub: employeeId,
    context: { organizationId, siteId, issuedAt, validUntil },
  })).toString('base64url');
  return { token: `e30.${payload}.signature`, issuedAt, validUntil };
}

function testBootstrap(overrides: Partial<OfflineAttendanceBootstrap> = {}): OfflineAttendanceBootstrap {
  const context = signedContext();
  return {
    version: 1,
    employeeId: 'employee-a', organizationId: 'org-a', employeeName: 'Employé A',
    sessionBinding: TEST_SESSION_BINDING, siteId: 'site-a', siteName: 'Site A',
    canCheckIn: true, canCheckOut: false, timeZone: 'Africa/Abidjan',
    securityPolicy: {
      enabled: false, selfieRequired: false, gpsRequired: false,
      locationConfigured: false, allowedRadiusMeters: null,
      companyLatitude: null, companyLongitude: null, siteId: 'site-a', siteName: 'Site A',
    },
    contextToken: context.token, contextIssuedAt: context.issuedAt,
    contextValidUntil: context.validUntil, snapshotAt: context.issuedAt,
    ...overrides,
  };
}

function enqueueTestAttendance(
  storage: Storage,
  input: Omit<
    Parameters<typeof enqueueOfflineAttendance>[1],
    'sessionBinding'
  >,
) {
  return enqueueOfflineAttendance(storage, {
    ...input,
    sessionBinding: TEST_SESSION_BINDING,
  });
}

describe('PWA offline attendance reliability', () => {
  it('loads durable pending, resolved and rejected outcomes with bounded requests', async () => {
    const values: Record<string, unknown> = {
      pending: { state: 'reconciliation_required', reviewStatus: 'PENDING_REVIEW', reason: 'Awaiting review' },
      resolved: { state: 'resolved', reviewStatus: 'RESOLVED', reason: 'Approved', decidedAt: '2026-09-02T08:00:00.000Z' },
      rejected: { state: 'rejected', reviewStatus: 'REJECTED', reason: 'Evidence not reliable', decidedAt: '2026-09-02T08:01:00.000Z' },
    };
    let active = 0;
    let maxActive = 0;
    const outcomes = await loadOfflineAttendanceOutcomes(
      ['pending', 'resolved', 'rejected', 'pending'],
      async (id) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
        return new Response(JSON.stringify(values[id]), { status: 200 });
      },
      2,
    );
    expect(maxActive).toBeLessThanOrEqual(2);
    expect([...outcomes.keys()].sort()).toEqual(['pending', 'rejected', 'resolved']);
    expect(outcomes.get('pending')).toMatchObject({ state: 'reconciliation_required', reviewStatus: 'PENDING_REVIEW' });
    expect(outcomes.get('resolved')).toMatchObject({ state: 'resolved', reviewStatus: 'RESOLVED', decidedAt: expect.any(String) });
    expect(outcomes.get('rejected')).toMatchObject({ state: 'rejected', reviewStatus: 'REJECTED', reason: 'Evidence not reliable' });
  });

  it('keeps lookup failures absent so the employee can continue seeing the retained local state', async () => {
    const outcomes = await loadOfflineAttendanceOutcomes(
      ['unauthorized', 'offline', 'missing'],
      async (id) => {
        if (id === 'offline') throw new Error('network unavailable');
        return new Response('{}', { status: id === 'unauthorized' ? 403 : 404 });
      },
    );
    expect(outcomes.size).toBe(0);
  });

  it('provides install metadata and registers its service worker', () => {
    const entryManifestSource = readFileSync(
      resolve(__dirname, '../../frontend/app/attendance-entry/manifest.ts'),
      'utf8',
    );
    const attendanceManifestSource = readFileSync(
      resolve(__dirname, '../../frontend/app/my-attendance/manifest.ts'),
      'utf8',
    );
    const layoutSource = readFileSync(
      resolve(__dirname, '../../frontend/app/attendance-entry/layout.tsx'),
      'utf8',
    );
    const registrationSource = readFileSync(
      resolve(
        __dirname,
        '../../frontend/components/pwa/service-worker-registration.tsx',
      ),
      'utf8',
    );

    expect(entryManifestSource).toContain("employeeManifest('/attendance-entry')");
    expect(attendanceManifestSource).toContain("employeeManifest('/my-attendance')");
    expect(layoutSource).toContain("manifest: '/attendance-entry/manifest.webmanifest'");
    expect(layoutSource).toContain('appleWebApp:');
    expect(registrationSource).toContain("register('/sw.js'");
    expect(registrationSource).toContain('.catch(() => undefined)');
  });

  it('only references real InOut assets for the worker and manifest', () => {
    const serviceWorker = readFileSync(
      resolve(__dirname, '../../frontend/public/sw.js'),
      'utf8',
    );
    const manifest = readFileSync(resolve(__dirname, '../../frontend/lib/employee-manifest.ts'), 'utf8');
    const assetPaths = [...serviceWorker.matchAll(/'\/brand\/[^']+'/g), ...manifest.matchAll(/'\/brand\/[^']+'/g)]
      .map(([assetPath]) => assetPath.slice(1, -1));
    const missingAssets = [...new Set(assetPaths)].filter((assetPath) =>
      !existsSync(resolve(__dirname, `../../frontend/public/${assetPath}`)));
    expect(missingAssets).toEqual([]);
    expect(serviceWorker).not.toContain('/icon-konatech.svg');
    expect(manifest).not.toContain('icon-konatech');
    expect(manifest).toContain("purpose: 'maskable'");
  });

  it('installs the versioned worker shell even when optional public assets fail', async () => {
    const serviceWorker = readFileSync(resolve(__dirname, '../../frontend/public/sw.js'), 'utf8');
    const listeners = new Map<string, (event: any) => void>();
    const entries = new Map<string, Response>();
    const cache = {
      match: async (key: string) => entries.get(key),
      put: async (key: string, value: Response) => { entries.set(key, value); },
    };
    const context = {
      self: {
        registration: { scope: 'https://inout.example/attendance-entry' },
        location: { origin: 'https://inout.example' },
        addEventListener: (name: string, handler: (event: any) => void) => listeners.set(name, handler),
        skipWaiting: jest.fn(),
      },
      caches: { open: async () => cache, keys: async () => [] },
      fetch: async (input: string) => input === '/attendance-entry/offline'
        ? new Response('<script src="/_next/static/chunks/offline.js"></script>', { status: 200, headers: { 'content-type': 'text/html' } })
        : input.startsWith('/_next/static/')
          ? new Response('immutable JS asset', { status: 200 })
          : new Response('missing optional asset', { status: 404 }),
      URL,
      Response,
      Promise,
    };
    runInNewContext(serviceWorker, context);
    let installPromise: Promise<void> | undefined;
    listeners.get('install')!({ waitUntil: (promise: Promise<void>) => { installPromise = promise; } });
    await installPromise;
    expect(entries.has('/attendance-entry/offline')).toBe(true);
    expect(entries.has('/_next/static/chunks/offline.js')).toBe(true);
    const readinessPort = { postMessage: jest.fn() };
    let readinessPromise: Promise<void> | undefined;
    listeners.get('message')!({
      data: { type: 'CHECK_OFFLINE_SHELL' },
      ports: [readinessPort],
      waitUntil: (promise: Promise<void>) => { readinessPromise = promise; },
    });
    await readinessPromise;
    expect(readinessPort.postMessage).toHaveBeenCalledWith({ shellReady: true });
    expect(context.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('keeps other PWA scope caches and claims clients only for user-approved updates', async () => {
    const serviceWorker = readFileSync(resolve(__dirname, '../../frontend/public/sw.js'), 'utf8');
    const listeners = new Map<string, (event: any) => void>();
    const deleted: string[] = [];
    const context = {
      self: {
        registration: { scope: 'https://inout.example/attendance-entry' },
        location: { origin: 'https://inout.example' },
        addEventListener: (name: string, handler: (event: any) => void) => listeners.set(name, handler),
        skipWaiting: jest.fn(),
        clients: { claim: jest.fn() },
      },
      caches: {
        keys: async () => [
          'inout-employee-shell-v1:/attendance-entry/',
          'inout-employee-shell-v2:/attendance-entry/',
          'inout-employee-shell-v2:/my-attendance/',
          'unrelated-application-cache',
        ],
        delete: async (key: string) => { deleted.push(key); return true; },
      },
      URL,
      Promise,
      Set,
    };
    runInNewContext(serviceWorker, context);
    listeners.get('message')!({ data: { type: 'ACTIVATE_UPDATE' }, waitUntil: jest.fn() });
    let activation: Promise<void> | undefined;
    listeners.get('activate')!({ waitUntil: (promise: Promise<void>) => { activation = promise; } });
    await activation;
    expect(context.self.skipWaiting).toHaveBeenCalledTimes(1);
    expect(context.self.clients.claim).toHaveBeenCalledTimes(1);
    expect(deleted).toEqual(['inout-employee-shell-v1:/attendance-entry/']);
    expect(serviceWorker).not.toContain('localStorage');
  });

  it('serves the shared interactive attendance surface after a cold offline launch', () => {
    const serviceWorker = readFileSync(
      resolve(__dirname, '../../frontend/public/sw.js'),
      'utf8',
    );
    const offlinePage = readFileSync(resolve(__dirname, '../../frontend/components/attendance/offline-attendance-page.tsx'), 'utf8');
    const actions = readFileSync(resolve(__dirname, '../../frontend/components/attendance/employee-attendance-actions.tsx'), 'utf8');
    const middleware = readFileSync(resolve(__dirname, '../../frontend/middleware.ts'), 'utf8');
    const registration = readFileSync(resolve(__dirname, '../../frontend/components/pwa/service-worker-registration.tsx'), 'utf8');
    expect(serviceWorker).toContain('new URL(`offline`, new URL(scopePath, scopeUrl.origin)).pathname');
    expect(serviceWorker).toContain('cache.put(offlinePath');
    expect(middleware).toContain("pathname === '/my-attendance/offline'");
    expect(offlinePage).toContain('<EmployeeAttendanceActions');
    expect(actions).toContain('enqueueOfflineAttendance');
    expect(actions).toContain('setLocallyQueued(true)');
    expect(actions).toContain('disabled={isBusy || locallyQueued}');
    expect(actions).toContain('Pointage mis en attente');
    expect(actions).toContain('Continuer vers le prochain pointage');
    expect(offlinePage).toContain('Préparation en ligne requise');
    expect(offlinePage).toContain('data-offline-readiness={offlineReadiness}');
    expect(offlinePage).toContain("!state.online && state.shellReadiness !== 'ready'");
    expect(registration).toContain('CHECK_OFFLINE_SHELL');
    expect(registration).toContain("publishOfflineShellReadiness('unavailable')");
  });

  it('uses a public offline shell without caching API or navigation responses', () => {
    const serviceWorker = readFileSync(
      resolve(__dirname, '../../frontend/public/sw.js'),
      'utf8',
    );
    const offlineShell = readFileSync(
      resolve(__dirname, '../../frontend/public/offline.html'),
      'utf8',
    );

    expect(serviceWorker).toContain("url.pathname.startsWith('/api/')");
    expect(serviceWorker).not.toMatch(/cache\.put\(request,\s*response\).*navigate/s);
    expect(serviceWorker).toContain("request.mode === 'navigate'");
    expect(offlineShell).toContain('attente');
  });

  it('stores signed context in an employee and tenant bound bootstrap and rejects tampering', () => {
    const storage = memoryStorage();
    const bootstrap = testBootstrap();
    expect(storeOfflineAttendanceBootstrap(storage, bootstrap)).toBe(true);
    expect(readActiveOfflineAttendanceBootstrap(storage)).toEqual(bootstrap);
    expect(storeOfflineAttendanceBootstrap(storage, testBootstrap({ employeeId: 'employee-b' }))).toBe(false);
    expect(storeOfflineAttendanceBootstrap(storage, testBootstrap({ organizationId: 'org-b' }))).toBe(false);
  });

  it('blocks captures after signed context expiry and preserves queued events when logout clears the bootstrap', () => {
    const storage = memoryStorage();
    const expiredAt = '2026-09-03T00:00:00.000Z';
    const context = signedContext('employee-a', 'org-a', 'site-a', '2026-09-01T00:00:00.000Z');
    const bootstrap = testBootstrap({ contextToken: context.token, contextIssuedAt: context.issuedAt, contextValidUntil: context.validUntil });
    expect(isOfflineContextValidForCapture(bootstrap, new Date(expiredAt))).toBe(false);
    expect(storeOfflineAttendanceBootstrap(storage, bootstrap)).toBe(true);
    enqueueTestAttendance(storage, { action: 'check-in', capturedAt: '2026-09-02T08:00:00.000Z' });
    clearActiveOfflineAttendanceBootstrap(storage);
    expect(readActiveOfflineAttendanceBootstrap(storage)).toBeNull();
    expect(readOfflineAttendanceQueue(storage)).toHaveLength(1);
  });

  it('derives the next offline intent in durable queue order from the prepared server state', () => {
    const storage = memoryStorage();
    const bootstrap = testBootstrap();
    expect(storeOfflineAttendanceBootstrap(storage, bootstrap)).toBe(true);
    const checkIn = enqueueTestAttendance(storage, {
      action: 'check-in', capturedAt: '2026-09-02T08:03:00.000Z', contextToken: bootstrap.contextToken,
    });
    const checkOut = enqueueTestAttendance(storage, {
      action: 'check-out', capturedAt: '2026-09-02T17:00:00.000Z', contextToken: bootstrap.contextToken,
    });
    expect(checkIn.sequence).toBeLessThan(checkOut.sequence!);
    expect(readActiveOfflineAttendanceBootstrap(storage)?.employeeId).toBe('employee-a');
    expect(readOfflineAttendanceQueue(storage).map((event) => event.capturedAt)).toEqual([
      '2026-09-02T08:03:00.000Z', '2026-09-02T17:00:00.000Z',
    ]);
  });

  it('recovers a persisted pending item after a browser restart', () => {
    const persistedValues = new Map<string, string>();
    const firstBrowser = memoryStorage(persistedValues);
    const queued = enqueueTestAttendance(firstBrowser, {
      action: 'check-in',
      capturedAt: '2026-09-02T10:00:00.000Z',
    });

    const restartedBrowser = memoryStorage(persistedValues);
    expect(readOfflineAttendanceQueue(restartedBrowser)).toEqual([queued]);
  });

  it('persists controlled backoff and resumes only when the retry is due', async () => {
    const persistedValues = new Map<string, string>();
    const firstBrowser = memoryStorage(persistedValues);
    enqueueTestAttendance(firstBrowser, {
      action: 'check-in',
      capturedAt: '2026-09-02T10:00:00.000Z',
    });
    let currentTime = new Date('2026-09-02T10:00:00.000Z');
    const submit = jest
      .fn<Promise<Response>, []>()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{"state":"accepted"}', { status: 201 }));

    await synchronizeOfflineAttendanceQueue(
      firstBrowser,
      TEST_SESSION_BINDING,
      submit,
      () => currentTime,
    );
    const restartedBrowser = memoryStorage(persistedValues);
    await synchronizeOfflineAttendanceQueue(
      restartedBrowser,
      TEST_SESSION_BINDING,
      submit,
      () => currentTime,
    );
    expect(submit).toHaveBeenCalledTimes(1);

    currentTime = new Date(currentTime.getTime() + 1_000);
    const [synced] = await synchronizeOfflineAttendanceQueue(
      restartedBrowser,
      TEST_SESSION_BINDING,
      submit,
      () => currentTime,
    );
    expect(synced).toMatchObject({ state: 'accepted', attempts: 2 });
  });

  it('stops at a transient failure and does not submit a dependent checkout', async () => {
    const storage = memoryStorage();
    enqueueTestAttendance(storage, {
      action: 'check-in',
      capturedAt: '2026-09-02T08:00:00.000Z',
    });
    enqueueTestAttendance(storage, {
      action: 'check-out',
      capturedAt: '2026-09-02T17:00:00.000Z',
    });
    const attemptedActions: string[] = [];
    const submit = jest
      .fn<Promise<Response>, [OfflineAttendanceItem]>()
      .mockImplementation(async (item) => {
        attemptedActions.push(item.action);
        return item.action === 'check-in'
          ? new Response('{}', { status: 503 })
          : new Response(JSON.stringify({ error: 'Check-in is unavailable.' }), {
              status: 400,
            });
      });

    const queue = await synchronizeOfflineAttendanceQueue(
      storage,
      TEST_SESSION_BINDING,
      submit as never,
      () => new Date('2026-09-02T18:00:00.000Z'),
    );

    expect(attemptedActions).toEqual(['check-in']);
    expect(queue.map(({ action, state }) => [action, state])).toEqual([
      ['check-in', 'pending'],
      ['check-out', 'pending'],
    ]);
  });

  it('continues in durable enqueue order after the head event succeeds on retry', async () => {
    const storage = memoryStorage();
    const checkIn = enqueueTestAttendance(storage, {
      action: 'check-in', capturedAt: '2026-09-02T08:00:00.000Z',
    });
    const checkOut = enqueueTestAttendance(storage, {
      action: 'check-out', capturedAt: '2026-09-02T17:00:00.000Z',
    });
    expect(checkIn.sequence).toBeLessThan(checkOut.sequence!);
    let currentTime = new Date('2026-09-02T18:00:00.000Z');
    const attempted: string[] = [];
    const submit = jest.fn(async (item: OfflineAttendanceItem) => {
      attempted.push(item.action);
      return new Response('{"state":"accepted"}', { status: 201 });
    });
    submit.mockImplementationOnce(async (item) => {
      attempted.push(item.action);
      return new Response('{}', { status: 503 });
    });
    await synchronizeOfflineAttendanceQueue(storage, TEST_SESSION_BINDING, submit, () => currentTime);
    expect(attempted).toEqual(['check-in']);
    currentTime = new Date(currentTime.getTime() + 1_000);
    const restartedStorage = memoryStorage(new Map([
      ['konatech:offline-attendance:v1', storage.getItem('konatech:offline-attendance:v1')!],
    ]));
    const finalQueue = await synchronizeOfflineAttendanceQueue(
      restartedStorage, TEST_SESSION_BINDING, submit, () => currentTime,
    );
    expect(attempted).toEqual(['check-in', 'check-in', 'check-out']);
    expect(finalQueue.map(({ state }) => state)).toEqual(['accepted', 'accepted']);
  });

  it('recovers an accepted event when the first response is lost, then sends checkout', async () => {
    const storage = memoryStorage();
    enqueueTestAttendance(storage, { action: 'check-in', capturedAt: '2026-09-02T08:00:00.000Z' });
    enqueueTestAttendance(storage, { action: 'check-out', capturedAt: '2026-09-02T17:00:00.000Z' });
    let currentTime = new Date('2026-09-02T18:00:00.000Z');
    let createdAttendanceCount = 0;
    const submitted: string[] = [];
    const submit = jest.fn(async (item: OfflineAttendanceItem) => {
      submitted.push(item.action);
      if (item.action === 'check-in') {
        if (createdAttendanceCount === 0) {
          createdAttendanceCount += 1;
          throw new Error('Connection lost after server commit');
        }
        return new Response(JSON.stringify({ state: 'accepted', idempotent: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ state: 'accepted' }), { status: 201 });
    });
    await synchronizeOfflineAttendanceQueue(storage, TEST_SESSION_BINDING, submit, () => currentTime);
    expect(submitted).toEqual(['check-in']);
    currentTime = new Date(currentTime.getTime() + 1_000);
    const queue = await synchronizeOfflineAttendanceQueue(storage, TEST_SESSION_BINDING, submit, () => currentTime);
    expect(submitted).toEqual(['check-in', 'check-in', 'check-out']);
    expect(createdAttendanceCount).toBe(1);
    expect(queue.map(({ state }) => state)).toEqual(['accepted', 'accepted']);
  });

  it('preserves order across multiple queued attendance sessions', async () => {
    const storage = memoryStorage();
    const actions = ['check-in', 'check-out', 'check-in', 'check-out'] as const;
    actions.forEach((action, index) => enqueueTestAttendance(storage, {
      action,
      capturedAt: `2026-09-02T${String(8 + index * 2).padStart(2, '0')}:00:00.000Z`,
    }));
    const submitted: string[] = [];
    const submit = jest.fn(async (item: OfflineAttendanceItem) => {
      submitted.push(item.action);
      return new Response('{"state":"accepted"}', { status: 201 });
    });
    const queue = await synchronizeOfflineAttendanceQueue(
      storage, TEST_SESSION_BINDING, submit,
      () => new Date('2026-09-02T18:00:00.000Z'),
    );
    expect(submitted).toEqual(actions);
    expect(queue.map(({ state }) => state)).toEqual(actions.map(() => 'accepted'));
  });

  it('does not treat a later checkout as standalone after check-in expires', async () => {
    const storage = memoryStorage();
    enqueueTestAttendance(storage, { action: 'check-in', capturedAt: '2026-09-01T08:00:00.000Z' });
    enqueueTestAttendance(storage, { action: 'check-out', capturedAt: '2026-09-01T17:00:00.000Z' });
    const submit = jest.fn();
    const queue = await synchronizeOfflineAttendanceQueue(
      storage, TEST_SESSION_BINDING, submit,
      () => new Date('2026-09-03T08:00:00.000Z'),
    );
    expect(submit).not.toHaveBeenCalled();
    expect(queue.map(({ state }) => state)).toEqual(['expired', 'expired']);
  });

  it('blocks later events after a permanent rejection', async () => {
    const storage = memoryStorage();
    enqueueTestAttendance(storage, { action: 'check-in', capturedAt: '2026-09-02T08:00:00.000Z' });
    enqueueTestAttendance(storage, { action: 'check-out', capturedAt: '2026-09-02T17:00:00.000Z' });
    const submit = jest.fn().mockResolvedValue(new Response('{"error":"invalid event"}', { status: 400 }));
    const queue = await synchronizeOfflineAttendanceQueue(
      storage, TEST_SESSION_BINDING, submit, () => new Date('2026-09-02T18:00:00.000Z'),
    );
    expect(submit).toHaveBeenCalledTimes(1);
    expect(queue.map(({ state }) => state)).toEqual(['rejected', 'pending']);
  });

  it('does not submit a context owned by another employee and preserves it', async () => {
    const storage = memoryStorage();
    const contextToken = `e30.${btoa(JSON.stringify({ sub: 'employee-a', context: { organizationId: 'org-a' } }))}.sig`;
    enqueueTestAttendance(storage, {
      action: 'check-in', capturedAt: '2026-09-02T08:00:00.000Z', contextToken,
    });
    const submit = jest.fn();
    const before = readOfflineAttendanceQueue(storage);
    await synchronizeOfflineAttendanceQueue(
      storage, 'employee-b-session', submit,
      () => new Date('2026-09-02T18:00:00.000Z'),
      { organizationId: 'org-a', employeeId: 'employee-b' },
    );
    expect(submit).not.toHaveBeenCalled();
    expect(readOfflineAttendanceQueue(storage)).toEqual(before);
  });

  it('coalesces simultaneous sync triggers for one employee queue', async () => {
    const storage = memoryStorage();
    enqueueTestAttendance(storage, { action: 'check-in', capturedAt: '2026-09-02T08:00:00.000Z' });
    let finish!: (response: Response) => void;
    const submit = jest.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const first = synchronizeOfflineAttendanceQueue(storage, TEST_SESSION_BINDING, submit, () => new Date('2026-09-02T08:01:00.000Z'));
    const second = synchronizeOfflineAttendanceQueue(storage, TEST_SESSION_BINDING, submit, () => new Date('2026-09-02T08:01:00.000Z'));
    await Promise.resolve();
    expect(submit).toHaveBeenCalledTimes(1);
    finish(new Response('{"state":"accepted"}', { status: 201 }));
    await Promise.all([first, second]);
  });

  it('stores only allow-listed evidence and never client identity or secrets', () => {
    const storage = memoryStorage();
    enqueueTestAttendance(storage, {
      action: 'check-in',
      capturedAt: '2026-09-02T10:00:00.000Z',
      organizationId: 'forged-organization',
      employeeId: 'forged-employee',
      accessToken: 'secret-jwt',
      pinCode: '1234',
      password: 'secret-password',
      security: {
        evidenceCapturedAt: '2026-09-02T10:00:00.000Z',
        latitude: 5.3,
        longitude: -4,
        accuracyMeters: 10,
      },
    } as unknown as Omit<
      Parameters<typeof enqueueOfflineAttendance>[1],
      'sessionBinding'
    >);

    const serializedQueue = JSON.stringify(readOfflineAttendanceQueue(storage));
    expect(serializedQueue).not.toContain('forged-organization');
    expect(serializedQueue).not.toContain('forged-employee');
    expect(serializedQueue).not.toContain('secret-jwt');
    expect(serializedQueue).not.toContain('1234');
    expect(serializedQueue).not.toContain('secret-password');
  });

  it('keeps event evidence available through delayed sync within the 24-hour event window', async () => {
    const storage = memoryStorage();
    const capturedAt = new Date();
    enqueueTestAttendance(storage, {
      action: 'check-in',
      capturedAt: capturedAt.toISOString(),
      security: {
        evidenceCapturedAt: capturedAt.toISOString(),
        latitude: 5.3,
        longitude: -4,
        verificationPhotoDataUrl: 'data:image/jpeg;base64,c2Vuc2l0aXZl',
      },
    });
    const submit = jest.fn<Promise<Response>, []>().mockResolvedValue(
      new Response('{}', { status: 503 }),
    );

    const [pending] = await synchronizeOfflineAttendanceQueue(
      storage,
      TEST_SESSION_BINDING,
      submit,
      () =>
        new Date(capturedAt.getTime() + 30 * 60_000),
    );

    expect(submit).toHaveBeenCalledTimes(1);
    expect(pending).toMatchObject({ state: 'pending' });
    expect(pending.security).toBeDefined();
  });

  it('continues bounded-backoff retries without discarding a legitimate event', async () => {
    const storage = memoryStorage();
    let currentTime = new Date();
    enqueueTestAttendance(storage, {
      action: 'check-in',
      capturedAt: currentTime.toISOString(),
      security: { verificationPhotoDataUrl: 'data:image/jpeg;base64,cGhvdG8=' },
    });
    const submit = jest
      .fn<Promise<Response>, []>()
      .mockResolvedValue(new Response('{}', { status: 503 }));

    for (
      let attempt = 0;
      attempt < 6;
      attempt += 1
    ) {
      await synchronizeOfflineAttendanceQueue(
        storage,
        TEST_SESSION_BINDING,
        submit,
        () => currentTime,
      );
      currentTime = new Date(currentTime.getTime() + 5 * 60_000);
    }

    const [pending] = readOfflineAttendanceQueue(storage);
    expect(submit).toHaveBeenCalledTimes(6);
    expect(pending).toMatchObject({ state: 'pending', attempts: 6 });
    expect(pending.security).toBeDefined();
  });

  it('retains an offline event for secured retry when the current session expires', async () => {
    const storage = memoryStorage();
    enqueueTestAttendance(storage, {
      action: 'check-in',
      capturedAt: new Date().toISOString(),
      security: { verificationPhotoDataUrl: 'data:image/jpeg;base64,cGhvdG8=' },
    });

    const [rejected] = await synchronizeOfflineAttendanceQueue(storage, TEST_SESSION_BINDING, () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'Session expirée.' }), {
          status: 401,
        }),
      ),
    );

    expect(rejected).toMatchObject({
      state: 'pending',
      attempts: 1,
      rejectionReason: 'Session expirée.',
    });
    expect(rejected.security).toBeDefined();
  });

  it('allows a signed context item to synchronize with a refreshed employee session', async () => {
    const storage = memoryStorage();
    enqueueOfflineAttendance(storage, {
      action: 'check-in',
      capturedAt: new Date().toISOString(),
      sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71',
      contextToken: `e30.${btoa(JSON.stringify({ sub: 'employee-a', context: { organizationId: 'org-a' } }))}.sig`,
    });
    const submit = jest
      .fn<Promise<Response>, []>()
      .mockResolvedValue(
        new Response(JSON.stringify({ state: 'accepted', receivedAt: new Date().toISOString() }), { status: 201 }),
      );
    const [item] = await synchronizeOfflineAttendanceQueue(
      storage,
      '1b175720-3c52-4828-8af8-dccbc1ec3b23',
      submit,
      undefined,
      { organizationId: 'org-a', employeeId: 'employee-a' },
    );
    expect(submit).toHaveBeenCalledTimes(1);
    expect(item.state).toBe('accepted');
  });

  it('preserves another employee session queue without submitting it', async () => {
    const storage = memoryStorage();
    const employeeASession = '0f205e79-48ae-469a-93a8-f8af87168e71';
    const employeeBSession = '1b175720-3c52-4828-8af8-dccbc1ec3b23';
    enqueueOfflineAttendance(storage, {
      action: 'check-in',
      capturedAt: new Date().toISOString(),
      sessionBinding: employeeASession,
      security: { verificationPhotoDataUrl: 'data:image/jpeg;base64,cGhvdG8=' },
    });
    const submit = jest.fn<Promise<Response>, []>();

    const [item] = await synchronizeOfflineAttendanceQueue(
      storage,
      employeeBSession,
      submit,
    );

    expect(submit).not.toHaveBeenCalled();
    expect(item).toMatchObject({ state: 'pending' });
    expect(item.security).toBeDefined();
  });

  it('cleans terminal metadata after its local retention period', () => {
    const storage = memoryStorage();
    const finalizedAt = new Date();
    const item = enqueueTestAttendance(storage, {
      action: 'check-in',
      capturedAt: finalizedAt.toISOString(),
    });
    const key = storage.key(0)!;
    storage.setItem(
      key,
      JSON.stringify([
        {
          ...item,
          state: 'accepted',
          finalizedAt: finalizedAt.toISOString(),
        },
      ]),
    );

    expect(
      cleanupOfflineAttendanceQueue(
        storage,
        () =>
          new Date(
            finalizedAt.getTime() + OFFLINE_ATTENDANCE_TERMINAL_RETENTION_MS,
          ),
      ),
    ).toEqual([]);
  });

  it('retains permanent queue outcomes so they continue blocking dependent events', () => {
    const storage = memoryStorage();
    const item = enqueueTestAttendance(storage, {
      action: 'check-in', capturedAt: '2026-09-02T08:00:00.000Z',
    });
    storage.setItem('konatech:offline-attendance:v1', JSON.stringify([
      { ...item, state: 'rejected', finalizedAt: '2026-09-02T08:00:00.000Z' },
    ]));
    const retained = cleanupOfflineAttendanceQueue(
      storage, () => new Date('2026-09-04T08:00:00.000Z'),
    );
    expect(retained).toHaveLength(1);
    expect(retained[0].state).toBe('rejected');
  });

  it('releases dependent events after a resolved server outcome and keeps rejected or expired outcomes as barriers', async () => {
    const decidedAt = '2026-09-02T08:00:00.000Z';
    const owner = { employeeId: 'employee-a', organizationId: 'org-a', sessionBinding: TEST_SESSION_BINDING };
    const makeQueue = (status: 'RESOLVED' | 'REJECTED' | 'EXPIRED') => {
      const storage = memoryStorage();
      const context = signedContext();
      const first = enqueueTestAttendance(storage, {
        action: 'check-in', capturedAt: '2026-09-02T07:00:00.000Z',
        contextToken: context.token,
      });
      const dependent = enqueueTestAttendance(storage, {
        action: 'check-out', capturedAt: '2026-09-02T07:01:00.000Z',
        contextToken: context.token,
      });
      storage.setItem('konatech:offline-attendance:v1', JSON.stringify([
        { ...first, state: 'reconciliation-required', serverAcknowledged: true },
        dependent,
      ]));
      expect(applyOfflineAttendanceReconciliationOutcome(storage, first.clientRequestId, {
        reviewStatus: status, decidedAt,
      }, owner)).toBe(true);
      return { storage, first, dependent };
    };

    const resolved = makeQueue('RESOLVED');
    expect(readOfflineAttendanceQueue(resolved.storage).map(({ state }) => state)).toEqual(['accepted', 'pending']);
    const resolvedQueue = readOfflineAttendanceQueue(resolved.storage);
    expect(applyOfflineAttendanceReconciliationOutcome(resolved.storage, resolved.first.clientRequestId, {
      reviewStatus: 'RESOLVED', decidedAt,
    }, owner)).toBe(false);
    expect(readOfflineAttendanceQueue(resolved.storage)).toEqual(resolvedQueue);
    expect(deriveOfflineAttendanceActions(testBootstrap({
      canCheckIn: false, canCheckOut: true, snapshotAt: decidedAt,
    }), readOfflineAttendanceQueue(resolved.storage))).toMatchObject({
      canCheckIn: true, canCheckOut: false, blocked: false,
    });

    for (const status of ['REJECTED', 'EXPIRED'] as const) {
      const terminal = makeQueue(status);
      const terminalQueue = readOfflineAttendanceQueue(terminal.storage);
      expect(applyOfflineAttendanceReconciliationOutcome(terminal.storage, terminal.first.clientRequestId, {
        reviewStatus: status, decidedAt,
      }, { ...owner, organizationId: 'org-other' })).toBe(false);
      expect(readOfflineAttendanceQueue(terminal.storage)).toEqual(terminalQueue);
      expect(readOfflineAttendanceQueue(terminal.storage).map(({ state }) => state)).toEqual([
        status === 'REJECTED' ? 'rejected' : 'expired', 'pending',
      ]);
      expect(deriveOfflineAttendanceActions(testBootstrap({ snapshotAt: decidedAt }),
        readOfflineAttendanceQueue(terminal.storage)).blocked).toBe(true);
      if (status === 'EXPIRED') {
        let submissions = 0;
        await synchronizeOfflineAttendanceQueue(
          terminal.storage,
          TEST_SESSION_BINDING,
          async () => {
            submissions += 1;
            return new Response(JSON.stringify({ state: 'accepted' }), { status: 200 });
          },
          () => new Date(decidedAt),
          owner,
        );
        expect(submissions).toBe(0);
        expect(readOfflineAttendanceQueue(terminal.storage).map(({ state }) => state)).toEqual([
          'expired', 'pending',
        ]);
      }
    }
  });

  it('marks an event past 24 hours expired and retains final metadata', () => {
    const storage = memoryStorage();
    const queuedAt = new Date();
    const item = enqueueTestAttendance(storage, {
      action: 'check-in',
      capturedAt: queuedAt.toISOString(),
      security: { verificationPhotoDataUrl: 'data:image/jpeg;base64,cGhvdG8=' },
    });

    const [expired] = cleanupOfflineAttendanceQueue(
      storage,
      () =>
        new Date(
          new Date(item.queuedAt!).getTime() +
            OFFLINE_ATTENDANCE_QUEUE_RETENTION_MS + 1,
        ),
    );

    expect(expired).toMatchObject({
      clientRequestId: item.clientRequestId,
      state: 'expired',
      rejectionReason: expect.stringContaining('réconciliation'),
    });
    expect(readOfflineAttendanceQueue(storage)[0].security).toBeDefined();
  });
});
