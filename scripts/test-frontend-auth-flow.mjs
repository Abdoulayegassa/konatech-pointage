import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frontend = resolve(root, 'apps/frontend');
const nativeFetch = globalThis.fetch.bind(globalThis);
const normalRequestTimeoutMs = 30_000;
const coldPageRequestTimeoutMs = 180_000;
let frontendOrigin;

async function collectPageRoutePatterns(directory, pathSegments = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  const routes = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith('_') || entry.name.startsWith('@')) continue;
      const segments = entry.name.startsWith('(')
        ? pathSegments
        : [...pathSegments, entry.name];
      routes.push(
        ...(await collectPageRoutePatterns(
          resolve(directory, entry.name),
          segments,
        )),
      );
      continue;
    }

    if (/^page\.(?:js|jsx|ts|tsx|mdx)$/.test(entry.name)) {
      const route = `/${pathSegments.join('/')}`.replace(/\/$/, '') || '/';
      routes.push({
        route,
        segments: pathSegments,
        staticSegments: pathSegments.filter(
          (segment) => !segment.startsWith('['),
        ).length,
      });
    }
  }

  return routes;
}

const pageRoutePatterns = (
  await collectPageRoutePatterns(resolve(frontend, 'app'))
).sort(
  (left, right) =>
    right.staticSegments - left.staticSegments ||
    right.segments.length - left.segments.length,
);
const firstAccessedPageRoutes = new Set();
const firstAccessedApiRoutes = new Set();

function pageRouteForPath(pathname) {
  const actualSegments = pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));

  return (
    pageRoutePatterns.find(({ segments }) => {
      let actualIndex = 0;
      for (const segment of segments) {
        if (/^\[\[\.\.\..+\]\]$/.test(segment)) return true;
        if (/^\[\.\.\..+\]$/.test(segment))
          return actualIndex < actualSegments.length;
        if (actualIndex >= actualSegments.length) return false;
        if (
          !/^\[.+\]$/.test(segment) &&
          segment !== actualSegments[actualIndex]
        )
          return false;
        actualIndex += 1;
      }
      return actualIndex === actualSegments.length;
    })?.route ?? pathname
  );
}

const fetch = async (input, init = {}) => {
  const inputUrl = input instanceof Request ? input.url : String(input);
  const url = new URL(inputUrl);
  const method =
    init.method ?? (input instanceof Request ? input.method : 'GET');
  const isNextPageRequest =
    frontendOrigin &&
    url.origin === frontendOrigin &&
    method === 'GET' &&
    !url.pathname.startsWith('/api/');
  const isNextApiRequest =
    frontendOrigin &&
    url.origin === frontendOrigin &&
    url.pathname.startsWith('/api/');
  const route = isNextPageRequest ? pageRouteForPath(url.pathname) : null;
  const firstRouteAccess =
    route !== null && !firstAccessedPageRoutes.has(route);
  const apiRoute = isNextApiRequest ? url.pathname : null;
  const firstApiRouteAccess =
    apiRoute !== null && !firstAccessedApiRoutes.has(apiRoute);
  const firstFrontendRouteAccess = firstRouteAccess || firstApiRouteAccess;
  const timeoutMs = firstFrontendRouteAccess
    ? coldPageRequestTimeoutMs
    : normalRequestTimeoutMs;

  if (firstFrontendRouteAccess) {
    const routeLabel = route ?? apiRoute;
    console.log(
      `[frontend-auth] First access to ${routeLabel}; one request allowed up to ${timeoutMs / 1000}s for Next.js compilation.`,
    );
  }

  const startedAt = Date.now();
  try {
    const response = await nativeFetch(input, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    });
    if (
      firstFrontendRouteAccess &&
      (response.status < 300 || response.status >= 400)
    ) {
      if (route !== null) firstAccessedPageRoutes.add(route);
      if (apiRoute !== null) firstAccessedApiRoutes.add(apiRoute);
      console.log(
        `[frontend-auth] First access to ${route ?? apiRoute} returned HTTP ${response.status} in ${Date.now() - startedAt}ms.`,
      );
    } else if (firstFrontendRouteAccess) {
      console.log(
        `[frontend-auth] First access to ${route ?? apiRoute} returned redirect HTTP ${response.status}; keeping its cold-compilation allowance for the next response.`,
      );
    }
    return response;
  } catch (error) {
    if (firstFrontendRouteAccess) {
      console.error(
        `[frontend-auth] First access to ${route ?? apiRoute} failed after ${Date.now() - startedAt}ms.`,
      );
    }
    throw error;
  }
};

async function availablePort() {
  return new Promise((resolvePort, reject) => {
    const server = createNetServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
}

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function account(token = 'final-account-jwt') {
  return {
    accessToken: token,
    tokenType: 'Bearer',
    expiresIn: '1h',
    user: {
      id: 'user-1',
      employeeIdentifier: 'EMP-1',
      firstName: 'Awa',
      lastName: 'Traore',
      email: 'awa@example.test',
      role: 'Admin',
      accessRole: 'ADMIN',
      department: null,
      isActive: true,
      scheduleId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

function attendanceEntryAccount() {
  const response = account('attendance-entry-jwt');
  response.expiresIn = '15m';
  response.user.accessRole = 'EMPLOYEE';
  response.user.role = 'Employee';
  return response;
}

function currentIdentity(role = 'ADMIN') {
  return {
    ...account().user,
    accessRole: role === 'ADMIN' ? 'ADMIN' : 'EMPLOYEE',
    membership: { id: `membership-${role.toLowerCase()}`, role },
    employee: null,
    organization: {
      id: 'organization-sites',
      name: 'Organisation Sites',
      slug: 'organisation-sites',
      timezone: 'Etc/UTC',
    },
  };
}

function unsignedExpiredJwt() {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ exp: 1 })}.signature`;
}

function cookies(response) {
  return (
    response.headers.getSetCookie?.() ?? [
      response.headers.get('set-cookie') ?? '',
    ]
  );
}

function cookieHeader(setCookies) {
  return setCookies
    .map((value) => value.split(';', 1)[0])
    .filter(Boolean)
    .join('; ');
}

async function assertRedirectsToMyAttendance(response) {
  if (response.status === 307) {
    assert.equal(response.headers.get('location'), '/my-attendance');
    return;
  }

  assert.match(await response.text(), /my-attendance/);
}

async function waitUntilReady(url, child) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null)
      throw new Error('Next.js exited before startup.');
    try {
      const response = await nativeFetch(url);
      if (response.status < 500) return;
    } catch {
      // The development server may refuse connections while it starts.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error('Next.js did not become ready.');
}

async function waitUntilRouteReady(url, child) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null)
      throw new Error('Next.js exited before the route became ready.');
    try {
      const response = await nativeFetch(url);
      // The route intentionally has no GET handler. A 405 proves that
      // Next.js has registered the route; a 404 means it is not ready yet.
      if (response.status === 405) return;
    } catch {
      // The development server may refuse connections while it starts.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error('Next.js attendance-entry route did not become ready.');
}

async function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return true;

  return new Promise((resolveExit) => {
    const onExit = () => {
      clearTimeout(timeout);
      resolveExit(true);
    };
    const timeout = setTimeout(() => {
      child.off('exit', onExit);
      resolveExit(false);
    }, timeoutMs);
    child.once('exit', onExit);
  });
}

async function stopNextServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  if (await waitForChildExit(child, 10_000)) return;

  console.error(
    '[frontend-auth] Next.js did not stop after SIGTERM; sending SIGKILL.',
  );
  child.kill('SIGKILL');
  if (!(await waitForChildExit(child, 5_000))) {
    console.error(
      '[frontend-auth] Next.js child process did not exit after SIGKILL.',
    );
  }
}

async function post(url, body, cookie) {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function patch(url, body, cookie) {
  return fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

const backendPort = await availablePort();
const frontendPort = await availablePort();
frontendOrigin = `http://127.0.0.1:${frontendPort}`;
let forwardedSelection;
let forwardedLogin;
let forwardedAttendanceEntry;
let forwardedAttendanceSite;
let forwardedInvitation;
let forwardedInvitationAcceptance;
let forwardedOrganizationProfile;
const platformDashboardAuthorizations = [];
const platformOrganizationListAuthorizations = [];
const platformOrganizationProvisionAuthorizations = [];
const platformPlanEntitlementAuthorizations = [];
const foreignSiteDetailsResponses = [];
const foreignSiteReportRequests = [];
const backend = createServer(async (request, response) => {
  const requestPath = new URL(request.url ?? '/', 'http://backend').pathname;
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');

  if (
    request.method === 'GET' &&
    requestPath === '/api/v1/attendance-sites/foreign-site'
  ) {
    foreignSiteDetailsResponses.push({
      status: 404,
      authorization: request.headers.authorization ?? '',
    });
    return json(response, 404, {});
  }
  if (requestPath.startsWith('/api/v1/attendance-sites/foreign-site/reports')) {
    foreignSiteReportRequests.push(requestPath);
    return json(response, 404, {});
  }

  if (request.url === '/api/v1/auth/login') {
    forwardedLogin = body;
    if (body.email === 'single@example.test')
      return json(response, 201, account());
    if (body.email === 'manager@example.test') {
      const managerAccount = account('manager-jwt');
      managerAccount.user.accessRole = 'EMPLOYEE';
      return json(response, 201, {
        ...managerAccount,
        membership: { id: 'membership-manager', role: 'EMPLOYEE' },
      });
    }
    if (body.email === 'member@example.test') {
      const memberAccount = account('member-jwt');
      memberAccount.user.accessRole = 'EMPLOYEE';
      return json(response, 201, {
        ...memberAccount,
        membership: { id: 'membership-member', role: 'EMPLOYEE' },
      });
    }
    if (body.email === 'platform@example.test') {
      return json(response, 201, {
        accessToken: 'platform-admin-jwt',
        tokenType: 'Bearer',
        expiresIn: '1h',
        platformAdmin: true,
      });
    }
    const challenge =
      body.email === 'expired@example.test'
        ? unsignedExpiredJwt()
        : body.email === 'invalid@example.test'
          ? 'invalid-challenge'
          : 'secret-challenge';
    return json(response, 201, {
      organizationSelectionRequired: true,
      organizationSelectionChallenge: challenge,
      organizations: [
        { id: 'org-a', name: 'Organisation A', slug: 'organisation-a' },
        { id: 'org-b', name: 'Organisation B', slug: 'organisation-b' },
      ],
    });
  }

  if (request.url === '/api/v1/auth/organization/select-initial') {
    forwardedSelection = body;
    if (
      body.challenge === 'invalid-challenge' ||
      body.challenge === unsignedExpiredJwt()
    ) {
      return json(response, 401, {
        message: 'Invalid or expired organization-selection challenge.',
      });
    }
    if (body.organizationId === 'org-unauthorized') {
      return json(response, 401, { message: 'Organization access denied.' });
    }
    return json(response, 201, account('fresh-account-jwt'));
  }

  if (request.url === '/api/v1/auth/attendance-entry/login') {
    forwardedAttendanceEntry = body;
    if (body.sitePublicId === '00000000-0000-4000-8000-000000000404') {
      return json(response, 404, { message: 'Attendance site not found.' });
    }
    if (body.pinCode === '9999') {
      return json(response, 401, { message: 'Identifiants invalides.' });
    }
    return json(response, 201, attendanceEntryAccount());
  }

  if (request.url === '/api/v1/auth/me' && request.method === 'GET') {
    const authorization = request.headers.authorization ?? '';
    if (authorization.includes('platform-admin-jwt')) {
      return json(response, 401, { message: 'Account context required.' });
    }
    const role = authorization.includes('manager-jwt')
      ? 'EMPLOYEE'
      : authorization.includes('member-jwt')
        ? 'EMPLOYEE'
        : authorization.includes('admin-jwt')
          ? 'ADMIN'
          : 'ADMIN';
    return json(response, 200, currentIdentity(role));
  }

  if (request.url === '/api/v1/platform/dashboard') {
    platformDashboardAuthorizations.push(request.headers.authorization ?? '');
    return json(response, 200, {
      statistics: {
        totalOrganizations: 0,
        byStatus: {
          TRIALING: 0,
          ACTIVE: 0,
          EXPIRED: 0,
          SUSPENDED: 0,
          PENDING_DOWNGRADE: 0,
          CANCELLED: 0,
        },
        byPlan: { STARTER: 0, PRO: 0, BUSINESS: 0 },
        usage: { activeEmployees: 0, activeAttendanceSites: 0 },
      },
      organizations: [],
    });
  }

  if (
    requestPath === '/api/v1/platform/organizations' &&
    request.method === 'GET'
  ) {
    const authorization = request.headers.authorization ?? '';
    platformOrganizationListAuthorizations.push(authorization);
    if (authorization !== 'Bearer platform-admin-jwt') {
      return json(response, 403, { message: 'Forbidden.' });
    }
    return json(response, 200, []);
  }

  if (
    requestPath === '/api/v1/platform/organizations' &&
    request.method === 'POST'
  ) {
    const authorization = request.headers.authorization ?? '';
    platformOrganizationProvisionAuthorizations.push(authorization);
    if (authorization !== 'Bearer platform-admin-jwt') {
      return json(response, 403, { message: 'Forbidden.' });
    }
    return json(response, 201, {
      organization: { id: 'organization-provisioned' },
      firstAdminInvitation: {
        invitation: { id: 'first-admin-invitation' },
        token: 'single-use-first-admin-token',
      },
    });
  }

  if (
    requestPath === '/api/v1/platform/plan-entitlements' &&
    request.method === 'GET'
  ) {
    const authorization = request.headers.authorization ?? '';
    platformPlanEntitlementAuthorizations.push(authorization);
    if (authorization !== 'Bearer platform-admin-jwt') {
      return json(response, 403, { message: 'Forbidden.' });
    }
    return json(response, 200, {
      STARTER: {
        activeEmployees: 10,
        activeAdministrators: 1,
        activeAttendanceSites: 1,
        customExport: true,
      },
      PRO: {
        activeEmployees: 50,
        activeAdministrators: 3,
        activeAttendanceSites: 3,
        customExport: true,
      },
      BUSINESS: {
        activeEmployees: 200,
        activeAdministrators: 10,
        activeAttendanceSites: 10,
        customExport: true,
      },
    });
  }

  if (request.url === '/api/v1/organizations/current/owner-onboarding') {
    const authorization = request.headers.authorization ?? '';
    if (authorization.includes('profile-error-jwt')) {
      return json(response, 503, { message: 'Onboarding unavailable.' });
    }
    const configured = authorization.includes('owner-complete-jwt');
    const closeToLimit = authorization.includes('quota-close-jwt');
    const atLimit = authorization.includes('quota-reached-jwt');
    return json(response, 200, {
      organizationProfile: {
        configured: true,
        name: 'Organisation Sites',
        status: 'ACTIVE',
        timezone: 'Etc/UTC',
      },
      subscription: {
        activeAdministratorCount: atLimit ? 3 : 1,
        administratorLimit: 3,
        plan: 'PRO',
        status: 'TRIALING',
      },
      attendanceSites: {
        activeCount: atLimit ? 3 : configured ? 1 : 0,
        limit: 3,
      },
      employees: {
        activeCount: closeToLimit ? 40 : configured ? 1 : 0,
        pinConfiguredCount: configured ? 1 : 0,
        limit: 50,
      },
      schedules: { activeAssignedCount: configured ? 1 : 0 },
      attendance: { firstClockInCompleted: configured },
      qr: { available: configured },
    });
  }

  if (request.url === '/api/v1/organizations/current') {
    const authorization = request.headers.authorization ?? '';
    const profile = {
      id: 'organization-sites',
      name: 'Organisation Sites',
      slug: 'organisation-sites',
      status: 'ACTIVE',
      timezone: 'Etc/UTC',
      logoUrl: null,
      primaryColor: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-09-08T00:00:00.000Z',
    };

    if (
      request.method === 'GET' &&
      authorization.includes('profile-error-jwt')
    ) {
      return json(response, 503, { message: 'Profile unavailable.' });
    }
    if (request.method === 'GET') return json(response, 200, profile);
    if (
      authorization.includes('manager-jwt') ||
      authorization.includes('member-jwt')
    ) {
      return json(response, 403, { message: 'Forbidden resource' });
    }
    if (body.timezone === 'Not/A_Timezone') {
      return json(response, 400, {
        message: 'timezone must be a valid IANA timezone.',
      });
    }

    forwardedOrganizationProfile = body;
    return json(response, 200, {
      ...profile,
      ...body,
      updatedAt: '2026-09-08T12:00:00.000Z',
    });
  }

  if (request.url === '/api/v1/organizations/current/attendance-settings') {
    const configured = (request.headers.authorization ?? '').includes(
      'owner-complete-jwt',
    );
    return json(response, 200, {
      organizationId: 'organization-sites',
      gpsRequired: configured ? false : null,
      selfieRequired: null,
      allowedRadiusMeters: null,
      defaultLatenessMarginMinutes: null,
      defaultWorkDays: null,
    });
  }

  if (request.url === '/api/v1/attendance-sites') {
    if (request.method === 'GET') {
      const authorization = request.headers.authorization ?? '';
      const configured = authorization.includes('owner-complete-jwt');
      const multiSite = authorization.includes('multi-site-jwt');
      if (multiSite)
        return json(response, 200, [
          {
            id: 'site-a',
            publicId: 'public-a',
            name: 'Bureau 1',
            latitude: 5,
            longitude: -4,
            allowedRadiusMeters: 100,
            isActive: true,
          },
          {
            id: 'site-b',
            publicId: 'public-b',
            name: 'Bureau 2',
            latitude: 5,
            longitude: -4,
            allowedRadiusMeters: 100,
            isActive: true,
          },
          {
            id: 'site-c',
            publicId: 'public-c',
            name: 'Bureau 3',
            latitude: 5,
            longitude: -4,
            allowedRadiusMeters: 100,
            isActive: true,
          },
          {
            id: 'site-inactive',
            publicId: 'public-inactive',
            name: 'Bureau fermé',
            latitude: 5,
            longitude: -4,
            allowedRadiusMeters: 100,
            isActive: false,
          },
        ]);
      return json(
        response,
        200,
        configured
          ? [
              {
                id: 'attendance-site-complete',
                publicId: '00000000-0000-4000-8000-000000000099',
                name: 'Siège configuré',
                latitude: 5.35,
                longitude: -4.01,
                allowedRadiusMeters: 100,
                isActive: true,
                createdAt: '2026-09-01T00:00:00.000Z',
                updatedAt: '2026-09-01T00:00:00.000Z',
              },
            ]
          : [],
      );
    }
    forwardedAttendanceSite = body;
    return json(response, 201, {
      id: '00000000-0000-4000-8000-000000000010',
      publicId: '00000000-0000-4000-8000-000000000011',
      ...body,
      isActive: true,
      createdAt: '2026-09-07T00:00:00.000Z',
      updatedAt: '2026-09-07T00:00:00.000Z',
    });
  }

  if (
    request.method === 'GET' &&
    request.url === '/api/v1/attendance-sites/site-a'
  ) {
    return json(response, 200, {
      id: 'site-a',
      publicId: 'public-a',
      name: 'Bureau 1',
      latitude: 5,
      longitude: -4,
      allowedRadiusMeters: 100,
      isActive: true,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });
  }

  if (request.url === '/api/v1/organizations/current/subscription') {
    const authorization = request.headers.authorization ?? '';
    if (authorization.includes('subscription-error-jwt')) {
      return json(response, 503, { message: 'Subscription unavailable.' });
    }
    if (authorization.includes('subscription-missing-jwt')) {
      return json(response, 404, { message: 'Subscription not found.' });
    }
    const status = authorization.includes('subscription-trial-jwt')
      ? 'TRIALING'
      : authorization.includes('subscription-expired-jwt')
        ? 'EXPIRED'
        : authorization.includes('subscription-suspended-jwt')
          ? 'SUSPENDED'
          : authorization.includes('subscription-pending-jwt')
            ? 'PENDING_DOWNGRADE'
            : 'ACTIVE';
    const pendingDowngrade = status === 'PENDING_DOWNGRADE';
    return json(response, 200, {
      subscription: {
        organizationId: 'organization-sites',
        plan: 'PRO',
        status,
        startsAt: '2026-09-01T00:00:00.000Z',
        endsAt: '2026-10-01T00:00:00.000Z',
        graceEndsAt: '2026-10-08T00:00:00.000Z',
        trialUsedAt: '2026-08-18T00:00:00.000Z',
        pendingPlan: pendingDowngrade ? 'STARTER' : null,
        pendingPlanAt: pendingDowngrade ? '2026-10-01T00:00:00.000Z' : null,
      },
      entitlements: {
        activeEmployees: 50,
        activeAdministrators: 5,
        activeAttendanceSites: 3,
        customExport: true,
      },
      usage: {
        activeEmployees: 12,
        activeAdministrators: 1,
        pendingAdministratorInvitations: 0,
        administratorCapacityUsed: 1,
        activeAttendanceSites: 2,
      },
      notifications: [
        {
          id: 'subscription-event-1',
          type: 'ACTIVATED',
          occurredAt: '2026-09-01T00:00:00.000Z',
          message: 'Mise à jour de votre abonnement.',
        },
      ],
    });
  }

  if (request.url === '/api/v1/employees' && request.method === 'GET') {
    return json(response, 200, []);
  }

  if (request.url === '/api/v1/dashboard/overview') {
    if ((request.headers.authorization ?? '').includes('dashboard-error-jwt')) {
      return json(response, 503, { message: 'Dashboard unavailable.' });
    }
    const configured = (request.headers.authorization ?? '').includes(
      'owner-complete-jwt',
    );
    return json(response, 200, {
      generatedAt: '2026-09-08T09:00:00.000Z',
      date: '2026-09-08T00:00:00.000Z',
      summary: {
        totalEmployees: configured ? 1 : 0,
        presentToday: 0,
        scheduledPresentToday: 0,
        lateEmployeesToday: 0,
        absentEmployeesToday: 0,
        earlyExitToday: 0,
        overtimeHoursToday: 0,
      },
      analytics: {
        absenceCountThisMonth: 0,
        earlyExitCount: 0,
        overtimeHoursThisMonth: 0,
        topLateEmployees: [],
        topOvertimeEmployees: [],
        topEarlyExitEmployees: [],
      },
      recentActivity: configured
        ? [
            {
              employeeIdentifier: 'EMP-1',
              employeeName: 'Awa Traore',
              department: null,
              status: 'LATE',
              date: '2026-09-08T00:00:00.000Z',
              clockInAt: '2026-09-08T07:20:00.000Z',
              clockOutAt: null,
              earlyExit: false,
              earlyExitMinutes: 0,
              overtimeHours: 0,
              overtimeMinutes: 0,
              absenceCount: 0,
              minutesLate: 20,
            },
          ]
        : [],
    });
  }

  if (request.url === '/api/v1/schedules' && request.method === 'GET') {
    const configured = (request.headers.authorization ?? '').includes(
      'owner-complete-jwt',
    );
    return json(
      response,
      200,
      configured
        ? [
            {
              id: 'schedule-complete',
              name: 'Planning principal',
              startTime: '08:00',
              endTime: '17:00',
              latenessMarginMinutes: 15,
              isActive: true,
              workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY'],
              createdAt: '2026-09-01T00:00:00.000Z',
              updatedAt: '2026-09-01T00:00:00.000Z',
              employees: [currentIdentity('EMPLOYEE')],
            },
          ]
        : [],
    );
  }

  if (request.url?.startsWith('/api/v1/calendar/month')) {
    return json(response, 200, {
      month: '2026-09',
      monthLabel: 'septembre 2026',
      summary: {
        workingDays: 22,
        weekends: 8,
        publicHolidays: 0,
        companyHolidays: 0,
      },
      days: [],
      entries: [],
    });
  }

  if (request.url?.startsWith('/api/v1/sanctions/rules')) {
    const configured = (request.headers.authorization ?? '').includes(
      'owner-complete-jwt',
    );
    return json(
      response,
      200,
      configured ? [{ id: 'rule-complete', active: true }] : [],
    );
  }

  if (request.url?.startsWith('/api/v1/sanctions/monthly')) {
    return json(response, 200, []);
  }

  if (
    request.url === '/api/v1/organizations/current/members' &&
    request.method === 'GET'
  ) {
    return json(response, 200, [
      {
        id: 'membership-owner',
        userId: 'user-1',
        role: 'ADMIN',
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        user: { id: 'user-1', normalizedEmail: 'owner@example.test' },
      },
    ]);
  }

  if (request.url === '/api/v1/organizations/current/invitations') {
    if (request.method === 'GET') return json(response, 200, []);
    forwardedInvitation = body;
    return json(response, 201, {
      invitation: {
        id: 'invitation-1',
        invitedByUserId: 'user-1',
        email: body.email,
        expiresAt: '2026-12-01T00:00:00.000Z',
        acceptedAt: null,
        revokedAt: null,
        createdAt: '2026-09-08T00:00:00.000Z',
      },
      invitationToken: 'must-not-reach-the-browser',
    });
  }

  if (request.url === '/api/v1/invitations/accept') {
    forwardedInvitationAcceptance = body;
    return json(response, 201, {
      user: { id: 'invited-user' },
      membership: { id: 'invited-membership', role: 'EMPLOYEE' },
      organization: { id: 'organization-sites', name: 'Organisation Sites' },
    });
  }

  json(response, 404, {});
});

await new Promise((resolveListen) =>
  backend.listen(backendPort, '127.0.0.1', resolveListen),
);
const next = spawn(
  process.execPath,
  [
    resolve(frontend, 'node_modules/next/dist/bin/next'),
    'dev',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(frontendPort),
  ],
  {
    cwd: frontend,
    env: {
      ...process.env,
      API_BASE_URL: `http://127.0.0.1:${backendPort}/api/v1`,
      NEXT_PUBLIC_API_BASE_URL: `http://127.0.0.1:${backendPort}/api/v1`,
      NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${frontendPort}`,
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  },
);

try {
  const base = frontendOrigin;
  await waitUntilReady(`${base}/login`, next);
  await waitUntilRouteReady(`${base}/api/auth/attendance-entry-session`, next);

  const anonymousProtectedPage = await fetch(
    `${base}/attendance-history?month=2026-09`,
    { redirect: 'manual' },
  );
  assert.equal(anonymousProtectedPage.status, 307);
  const anonymousLoginUrl = new URL(
    anonymousProtectedPage.headers.get('location'),
    base,
  );
  assert.equal(anonymousLoginUrl.pathname, '/login');
  assert.equal(
    anonymousLoginUrl.searchParams.get('redirectTo'),
    '/attendance-history?month=2026-09',
  );

  const single = await post(`${base}/api/auth/login`, {
    email: 'single@example.test',
    password: 'password',
    redirectTo: '/employees',
  });
  const singleBody = await single.json();
  assert.equal(single.status, 200);
  assert.deepEqual(forwardedLogin, {
    email: 'single@example.test',
    password: 'password',
  });
  assert.equal(singleBody.redirectTo, '/employees');
  assert.match(
    cookies(single).join('\n'),
    /konatech_session=final-account-jwt/,
  );

  const platform = await post(`${base}/api/auth/login`, {
    email: 'platform@example.test',
    password: 'password',
    redirectTo: '/employees',
  });
  const platformBody = await platform.json();
  assert.equal(platform.status, 200);
  assert.deepEqual(platformBody, {
    redirectTo: '/platform',
    platformAdmin: true,
  });
  assert.match(
    cookies(platform).join('\n'),
    /konatech_session=platform-admin-jwt/,
  );

  const logout = await fetch(`${base}/api/auth/logout`, {
    method: 'POST',
    redirect: 'manual',
  });
  assert.equal(logout.status, 307);
  assert.equal(logout.headers.get('location'), `${base}/login`);

  const managerLogin = await post(`${base}/api/auth/login`, {
    email: 'manager@example.test',
    password: 'password',
    redirectTo: '/employees',
  });
  assert.equal(managerLogin.status, 200);
  assert.equal((await managerLogin.json()).redirectTo, '/my-attendance');

  const managerHistoryLogin = await post(`${base}/api/auth/login`, {
    email: 'manager@example.test',
    password: 'password',
    redirectTo: '/attendance-history',
  });
  assert.equal(managerHistoryLogin.status, 200);
  assert.equal((await managerHistoryLogin.json()).redirectTo, '/my-attendance');

  const managerSchedulesLogin = await post(`${base}/api/auth/login`, {
    email: 'manager@example.test',
    password: 'password',
    redirectTo: '/schedules',
  });
  assert.equal(managerSchedulesLogin.status, 200);
  assert.equal(
    (await managerSchedulesLogin.json()).redirectTo,
    '/my-attendance',
  );

  const memberSubscriptionLogin = await post(`${base}/api/auth/login`, {
    email: 'member@example.test',
    password: 'password',
    redirectTo: '/subscription',
  });
  assert.equal(memberSubscriptionLogin.status, 200);
  assert.equal(
    (await memberSubscriptionLogin.json()).redirectTo,
    '/my-attendance',
  );

  const memberPlatformLogin = await post(`${base}/api/auth/login`, {
    email: 'member@example.test',
    password: 'password',
    redirectTo: '/platform/subscriptions',
  });
  assert.equal(memberPlatformLogin.status, 200);
  assert.equal((await memberPlatformLogin.json()).redirectTo, '/my-attendance');

  const platformPage = await fetch(`${base}/platform`, {
    headers: { Cookie: 'konatech_session=platform-admin-jwt' },
    redirect: 'manual',
  });
  assert.equal(platformPage.status, 200);
  const platformHtml = await platformPage.text();
  assert.match(platformHtml, /Administration plateforme/);
  assert.match(platformHtml, /hors contexte d’organisation/);
  assert.match(platformHtml, />Tableau de bord</);
  assert.match(platformHtml, />Organisations</);
  assert.match(platformHtml, />Abonnements</);
  assert.match(platformHtml, /aria-current="page"/);

  const tenantPlatformPage = await fetch(`${base}/platform`, {
    headers: { Cookie: 'konatech_session=owner-jwt' },
    redirect: 'manual',
  });
  if (tenantPlatformPage.status === 307) {
    assert.equal(tenantPlatformPage.headers.get('location'), '/dashboard');
  } else {
    const tenantPlatformHtml = await tenantPlatformPage.text();
    // App Router redirects can be streamed with a destination loading shell in
    // Next.js 15. Assert the actual browser-observable redirect mechanism
    // rather than the obsolete internal NEXT_REDIRECT marker.
    assert.match(
      tenantPlatformHtml,
      /<meta[^>]+http-equiv="refresh"[^>]+url=\//,
    );
  }
  const organizationsPage = await fetch(`${base}/platform/organizations`, {
    headers: { Cookie: 'konatech_session=platform-admin-jwt' },
    redirect: 'manual',
  });
  assert.equal(organizationsPage.status, 200);
  const organizationsHtml = await organizationsPage.text();
  assert.match(organizationsHtml, /Administration plateforme/);
  assert.match(organizationsHtml, />Organisations</);
  assert.match(organizationsHtml, /aria-current="page"/);

  const provisionedOrganization = await fetch(
    `${base}/api/platform/organizations`,
    {
      method: 'POST',
      headers: {
        Cookie: 'konatech_session=platform-admin-jwt',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Provisioned Organization',
        slug: 'provisioned-organization',
        timezone: 'Etc/UTC',
        firstAdminEmail: 'first-admin@example.test',
      }),
    },
  );
  assert.equal(provisionedOrganization.status, 201);
  assert.match(
    provisionedOrganization.headers.get('cache-control') ?? '',
    /no-store/,
  );
  assert.equal(
    (await provisionedOrganization.json()).firstAdminInvitation.token,
    'single-use-first-admin-token',
  );

  const tenantProvisionAttempt = await fetch(
    `${base}/api/platform/organizations`,
    {
      method: 'POST',
      headers: {
        Cookie: 'konatech_session=owner-jwt',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Tenant Organization',
        slug: 'tenant-organization',
        timezone: 'Etc/UTC',
        firstAdminEmail: 'admin@example.test',
      }),
    },
  );
  assert.equal(tenantProvisionAttempt.status, 403);
  assert.deepEqual(platformOrganizationProvisionAuthorizations, [
    'Bearer platform-admin-jwt',
    'Bearer owner-jwt',
  ]);

  const legacyPlatformPage = await fetch(`${base}/platform/subscriptions`, {
    headers: { Cookie: 'konatech_session=platform-admin-jwt' },
    redirect: 'manual',
  });
  assert.equal(legacyPlatformPage.status, 200);
  const subscriptionsHtml = await legacyPlatformPage.text();
  assert.match(subscriptionsHtml, /Administration plateforme/);
  assert.match(subscriptionsHtml, />Abonnements</);
  assert.match(subscriptionsHtml, /aria-current="page"/);
  assert.deepEqual(platformOrganizationListAuthorizations, [
    'Bearer platform-admin-jwt',
  ]);

  const plansPage = await fetch(`${base}/platform/plans`, {
    headers: { Cookie: 'konatech_session=platform-admin-jwt' },
    redirect: 'manual',
  });
  assert.equal(plansPage.status, 200);
  const plansHtml = await plansPage.text();
  assert.match(plansHtml, /Administration plateforme/);
  assert.match(plansHtml, />Plans</);
  assert.match(plansHtml, /Lecture seule/);
  assert.match(plansHtml, /aria-current="page"/);
  assert.deepEqual(platformPlanEntitlementAuthorizations, [
    'Bearer platform-admin-jwt',
  ]);
  assert.deepEqual(platformDashboardAuthorizations, [
    'Bearer platform-admin-jwt',
    'Bearer platform-admin-jwt',
    'Bearer platform-admin-jwt',
  ]);

  const invalidLogin = await post(`${base}/api/auth/login`, {
    email: 'invalid@example.test',
    password: 'password',
  });
  const invalid = await post(
    `${base}/api/auth/organization/select-initial`,
    { organizationId: 'org-a' },
    cookieHeader(cookies(invalidLogin)),
  );
  assert.equal(invalid.status, 401);
  assert.deepEqual(await invalid.json(), {
    error: 'Impossible de vous authentifier pour cette organisation.',
  });
  assert.doesNotMatch(cookies(invalid).join('\n'), /konatech_session=(?!;)/);

  const multi = await post(
    `${base}/api/auth/login`,
    {
      email: 'multi@example.test',
      password: 'password',
      redirectTo: '//evil.test',
    },
    'konatech_session=old-account-jwt',
  );
  const multiBody = await multi.json();
  const multiCookies = cookies(multi);
  assert.deepEqual(multiBody, {
    organizationSelectionRequired: true,
    organizations: [
      { id: 'org-a', name: 'Organisation A', slug: 'organisation-a' },
      { id: 'org-b', name: 'Organisation B', slug: 'organisation-b' },
    ],
  });
  assert.equal(JSON.stringify(multiBody).includes('challenge'), false);
  assert.match(
    multiCookies.join('\n'),
    /konatech_organization_selection=secret-challenge/,
  );
  assert.match(
    multiCookies.join('\n'),
    /konatech_organization_selection=[^\n]*HttpOnly/i,
  );
  assert.match(
    multiCookies.join('\n'),
    /konatech_organization_selection=[^\n]*SameSite=lax/i,
  );
  assert.match(
    multiCookies.join('\n'),
    /konatech_organization_selection=[^\n]*Max-Age=300/i,
  );
  assert.match(multiCookies.join('\n'), /konatech_session=;[^\n]*Max-Age=0/i);
  assert.doesNotMatch(multiCookies.join('\n'), /konatech_session=(?!;)/);

  forwardedSelection = null;
  const selected = await post(
    `${base}/api/auth/organization/select-initial`,
    { organizationId: 'org-a' },
    cookieHeader(multiCookies),
  );
  const selectedBody = await selected.json();
  const selectedCookies = cookies(selected).join('\n');
  assert.deepEqual(forwardedSelection, {
    challenge: 'secret-challenge',
    organizationId: 'org-a',
  });
  // Phase 8.5-C: Admin landing is now the organization overview URL.
  assert.equal(selectedBody.redirectTo, '/dashboard');
  assert.match(selectedCookies, /konatech_session=fresh-account-jwt/);
  assert.match(
    selectedCookies,
    /konatech_organization_selection=;[^\n]*Max-Age=0/i,
  );

  const missing = await post(`${base}/api/auth/organization/select-initial`, {
    organizationId: 'org-a',
  });
  assert.equal(missing.status, 401);

  const unauthorized = await post(
    `${base}/api/auth/organization/select-initial`,
    { organizationId: 'org-unauthorized' },
    cookieHeader(multiCookies),
  );
  assert.equal(unauthorized.status, 401);
  assert.equal(
    JSON.stringify(await unauthorized.json()).includes('membership'),
    false,
  );
  assert.doesNotMatch(
    cookies(unauthorized).join('\n'),
    /konatech_session=(?!;)/,
  );

  const expiredLogin = await post(`${base}/api/auth/login`, {
    email: 'expired@example.test',
    password: 'password',
  });
  const expired = await post(
    `${base}/api/auth/organization/select-initial`,
    { organizationId: 'org-a' },
    cookieHeader(cookies(expiredLogin)),
  );
  assert.equal(expired.status, 401);
  assert.deepEqual(await expired.json(), {
    error: 'Votre session de connexion a expiré. Veuillez vous reconnecter.',
  });
  assert.match(
    cookies(expired).join('\n'),
    /konatech_organization_selection=;[^\n]*Max-Age=0/i,
  );

  const sitePublicId = '00000000-0000-4000-8000-000000000001';
  forwardedAttendanceEntry = null;
  const attendanceEntry = await post(
    `${base}/api/auth/attendance-entry-session`,
    { pinCode: '6789', sitePublicId },
  );
  assert.equal(attendanceEntry.status, 200);
  assert.deepEqual(forwardedAttendanceEntry, {
    pinCode: '6789',
    sitePublicId,
  });
  assert.deepEqual(await attendanceEntry.json(), {
    redirectTo: `/attendance-entry?sitePublicId=${sitePublicId}`,
    user: attendanceEntryAccount().user,
  });
  assert.match(
    cookies(attendanceEntry).join('\n'),
    /konatech_attendance_entry_session=attendance-entry-jwt/,
  );
  assert.match(
    cookies(attendanceEntry).join('\n'),
    /konatech_attendance_entry_session=[^\n]*Max-Age=900/i,
  );

  const wrongAttendancePin = await post(
    `${base}/api/auth/attendance-entry-session`,
    { pinCode: '9999', sitePublicId },
  );
  assert.equal(wrongAttendancePin.status, 401);
  assert.deepEqual(await wrongAttendancePin.json(), {
    error: 'Identifiants invalides.',
  });

  const missingSitePage = await fetch(`${base}/attendance-entry`);
  assert.equal(missingSitePage.status, 200);
  assert.match(await missingSitePage.text(), /Site de pointage requis/);

  const sitePage = await fetch(
    `${base}/attendance-entry?sitePublicId=${sitePublicId}`,
  );
  assert.equal(sitePage.status, 200);
  assert.match(await sitePage.text(), /Entrez votre code PIN à 4 chiffres/);

  const firstRunOwnerDashboard = await fetch(`${base}/dashboard`, {
    headers: { Cookie: 'konatech_session=owner-jwt' },
  });
  assert.equal(firstRunOwnerDashboard.status, 200);
  const firstRunOwnerHtml = await firstRunOwnerDashboard.text();
  const organizationAttendancePage = await fetch(
    `${base}/organization/attendance`,
    {
      headers: { Cookie: 'konatech_session=owner-complete-jwt' },
    },
  );
  assert.equal(organizationAttendancePage.status, 200);
  const organizationAttendanceHtml = await organizationAttendancePage.text();
  assert.match(organizationAttendanceHtml, /Présences aujourd’hui/);
  assert.match(organizationAttendanceHtml, /Activité récente/);
  assert.match(organizationAttendanceHtml, /Awa Traore/);
  assert.match(firstRunOwnerHtml, /Créer le premier site/);
  assert.match(firstRunOwnerHtml, /Prochaine étape/);
  assert.match(firstRunOwnerHtml, /Site de pointage/);
  assert.match(firstRunOwnerHtml, /Abonnement et quotas/);
  assert.match(firstRunOwnerHtml, /Planning de travail/);
  assert.match(firstRunOwnerHtml, /QR du site/);
  assert.match(firstRunOwnerHtml, /Premier pointage/);
  assert.match(firstRunOwnerHtml, /Afficher les étapes/);
  assert.match(firstRunOwnerHtml, /href="\/organization\/settings"/);
  assert.match(firstRunOwnerHtml, /href="\/organization\/subscription"/);
  assert.match(firstRunOwnerHtml, /href="\/sites"/);
  assert.match(firstRunOwnerHtml, /href="\/organization\/employees"/);
  assert.match(firstRunOwnerHtml, /href="\/organization\/members"/);
  assert.match(firstRunOwnerHtml, />Invitations</);
  assert.match(firstRunOwnerHtml, /Analyse · Tous les sites/);
  assert.doesNotMatch(firstRunOwnerHtml, /href="\/organization\/attendance"/);
  assert.doesNotMatch(firstRunOwnerHtml, /href="\/schedules"/);
  assert.match(firstRunOwnerHtml, /href="\/organization\/reports"/);
  assert.match(firstRunOwnerHtml, /href="\/organization\/subscription"/);
  assert.match(firstRunOwnerHtml, /Vue globale/);
  assert.match(firstRunOwnerHtml, /Plan (?:<!-- -->)?Pro/);
  assert.match(firstRunOwnerHtml, /Essai en cours/);
  assert.match(firstRunOwnerHtml, /0.{0,100}50/s);
  assert.match(firstRunOwnerHtml, /1.{0,100}3/s);
  assert.match(firstRunOwnerHtml, /0.{0,100}3/s);
  assert.match(firstRunOwnerHtml, /href="\/organization\/subscription"/);
  assert.match(firstRunOwnerHtml, /Aucun site configuré/);
  assert.match(firstRunOwnerHtml, /Créer le premier site/);
  assert.match(firstRunOwnerHtml, /href="\/organization\/employees"/);
  assert.match(firstRunOwnerHtml, /href="\/sites"/);
  assert.match(firstRunOwnerHtml, /href="\/organization\/history"/);
  assert.match(firstRunOwnerHtml, /href="\/organization\/reports"/);
  assert.match(firstRunOwnerHtml, /href="\/organization\/settings"/);
  assert.match(firstRunOwnerHtml, /href="\/organization\/subscription"/);
  assert.match(firstRunOwnerHtml, /Afficher les étapes/);
  assert.doesNotMatch(firstRunOwnerHtml, /<details[^>]*open/);
  assert.doesNotMatch(
    firstRunOwnerHtml,
    /Classements RH|Top retards|Top heures supplémentaires/,
  );

  for (const [legacyPath, canonicalPath] of [
    ['/attendance-sites', '/sites'],
    ['/organization-settings', '/organization/settings'],
    ['/subscription', '/organization/subscription'],
    ['/calendar', '/organization/calendar'],
    ['/sanctions', '/organization/sanctions'],
  ]) {
    const legacyResponse = await fetch(`${base}${legacyPath}`, {
      headers: { Cookie: 'konatech_session=owner-jwt' },
      redirect: 'manual',
    });
    assert.equal(legacyResponse.status, 307);
    assert.equal(legacyResponse.headers.get('location'), canonicalPath);
  }
  const rootAdminResponse = await fetch(`${base}/`, {
    headers: { Cookie: 'konatech_session=owner-jwt' },
    redirect: 'manual',
  });
  if (rootAdminResponse.status === 307)
    assert.equal(rootAdminResponse.headers.get('location'), '/dashboard');
  else assert.match(await rootAdminResponse.text(), /dashboard/);
  assert.doesNotMatch(firstRunOwnerHtml, /rel="manifest"/);

  const adminDashboard = await fetch(`${base}/dashboard`, {
    headers: { Cookie: 'konatech_session=admin-jwt' },
  });
  assert.equal(adminDashboard.status, 200);
  const adminDashboardHtml = await adminDashboard.text();
  assert.match(adminDashboardHtml, /href="\/organization\/members"/);
  assert.match(adminDashboardHtml, />Invitations</);
  assert.match(adminDashboardHtml, /href="\/organization\/subscription"/);

  // Phase 8.5-C: URL-selected site is checked against the authenticated
  // organization's site list. Navigation visibility is never authorization.
  assert.match(firstRunOwnerHtml, /Créer le premier site/);
  assert.doesNotMatch(firstRunOwnerHtml, /href="\/site\//);
  const oneSiteDashboard = await fetch(`${base}/dashboard`, {
    headers: { Cookie: 'konatech_session=owner-complete-jwt' },
  });
  const oneSiteHtml = await oneSiteDashboard.text();
  assert.match(oneSiteHtml, /Siège configuré/);
  assert.match(
    oneSiteHtml,
    /href="\/site\/attendance-site-complete\/dashboard"/,
  );
  const multiSiteDashboard = await fetch(`${base}/dashboard`, {
    headers: { Cookie: 'konatech_session=multi-site-jwt' },
  });
  const multiSiteHtml = await multiSiteDashboard.text();
  for (const name of ['Bureau 1', 'Bureau 2', 'Bureau 3'])
    assert.match(multiSiteHtml, new RegExp(name));
  assert.match(multiSiteHtml, /Choisir un site/);
  assert.doesNotMatch(
    multiSiteHtml,
    /href="\/site\/(?:site-a|site-b|site-c)\/(?:schedules|qr)"/,
  );
  assert.doesNotMatch(multiSiteHtml, /Bureau fermé<\/option>/);
  for (const [siteId, siteName] of [
    ['site-a', 'Bureau 1'],
    ['site-b', 'Bureau 2'],
    ['site-c', 'Bureau 3'],
  ]) {
    const sitePage = await fetch(`${base}/site/${siteId}/dashboard`, {
      headers: { Cookie: 'konatech_session=multi-site-jwt' },
    });
    assert.equal(sitePage.status, 200);
    const siteHtml = await sitePage.text();
    assert.match(siteHtml, /Organisation Sites/);
    assert.match(siteHtml, new RegExp(siteName));
    assert.match(
      siteHtml,
      new RegExp(`aria-current="page"[^>]*href="/site/${siteId}/dashboard"`),
    );
    for (const section of [
      'employees',
      'attendance',
      'schedules',
      'history',
      'reports',
      'calendar',
      'sanctions',
      'qr',
      'settings',
    ]) {
      assert.match(siteHtml, new RegExp(`href="/site/${siteId}/${section}"`));
    }
    assert.match(siteHtml, /Vue d’ensemble organisation/);
    assert.match(siteHtml, /Tableau de bord/);
    assert.doesNotMatch(siteHtml, /href="\/organization\//);
    assert.doesNotMatch(siteHtml, /Présences aujourd’hui/);
  }

  foreignSiteDetailsResponses.length = 0;
  foreignSiteReportRequests.length = 0;
  const foreignSitePage = await fetch(`${base}/site/foreign-site/reports`, {
    headers: { Cookie: 'konatech_session=multi-site-jwt' },
  });
  const foreignSiteHtml = await foreignSitePage.text();
  assert.match(foreignSiteHtml, /404|notFound|This page could not be found/);
  assert.doesNotMatch(foreignSiteHtml, /Rapport —|Période du rapport/);
  assert.ok(
    foreignSiteDetailsResponses.every(
      ({ status, authorization }) =>
        status === 404 && authorization.includes('multi-site-jwt'),
    ),
    'Foreign site details were not rejected for the authenticated tenant admin.',
  );
  assert.deepEqual(
    foreignSiteReportRequests,
    [],
    'Foreign-site report data must not be requested.',
  );
  const inactiveSitePage = await fetch(`${base}/site/site-inactive/dashboard`, {
    headers: { Cookie: 'konatech_session=multi-site-jwt' },
    redirect: 'manual',
  });
  assert.equal(inactiveSitePage.status, 200);
  const inactiveHtml = await inactiveSitePage.text();
  assert.match(inactiveHtml, /Bureau fermé/);
  assert.match(inactiveHtml, /Site inactif/);
  assert.match(inactiveHtml, new RegExp(`href="/site/site-inactive/history"`));
  assert.doesNotMatch(
    inactiveHtml,
    /href="\/site\/site-inactive\/(?:employees|schedules|attendance|calendar|sanctions|qr|settings)"/,
  );
  const employeeSitePage = await fetch(`${base}/site/site-a/dashboard`, {
    headers: { Cookie: 'konatech_session=member-jwt' },
    redirect: 'manual',
  });
  await assertRedirectsToMyAttendance(employeeSitePage);
  const platformSitePage = await fetch(`${base}/site/site-a/dashboard`, {
    headers: { Cookie: 'konatech_session=platform-admin-jwt' },
    redirect: 'manual',
  });
  if (platformSitePage.status === 200)
    assert.match(await platformSitePage.text(), /login|NEXT_REDIRECT/);
  assert.match(adminDashboardHtml, /Première configuration/);

  const configuredOwnerDashboard = await fetch(`${base}/dashboard`, {
    headers: { Cookie: 'konatech_session=owner-complete-jwt' },
  });
  assert.equal(configuredOwnerDashboard.status, 200);
  const configuredOwnerHtml = await configuredOwnerDashboard.text();
  assert.doesNotMatch(configuredOwnerHtml, /Première configuration/);
  assert.match(configuredOwnerHtml, /Awa Traore/);
  assert.match(configuredOwnerHtml, /08 septembre/);
  assert.match(configuredOwnerHtml, /07:20/);
  assert.match(configuredOwnerHtml, /Retard : 20 min/);
  assert.match(configuredOwnerHtml, /Sortie manquante/);
  assert.doesNotMatch(configuredOwnerHtml, /<details[^>]*open/);

  const closeQuotaDashboard = await fetch(`${base}/dashboard`, {
    headers: { Cookie: 'konatech_session=quota-close-jwt' },
  });
  assert.equal(closeQuotaDashboard.status, 200);
  const closeQuotaHtml = await closeQuotaDashboard.text();
  assert.match(closeQuotaHtml, /40.{0,100}50/s);
  assert.match(closeQuotaHtml, /href="\/organization\/subscription"/);

  const reachedQuotaDashboard = await fetch(`${base}/dashboard`, {
    headers: { Cookie: 'konatech_session=quota-reached-jwt' },
  });
  assert.equal(reachedQuotaDashboard.status, 200);
  const reachedQuotaHtml = await reachedQuotaDashboard.text();
  assert.match(reachedQuotaHtml, /0.{0,100}50/s);
  assert.match(reachedQuotaHtml, /href="\/organization\/subscription"/);

  const unavailableOnboardingDashboard = await fetch(`${base}/dashboard`, {
    headers: { Cookie: 'konatech_session=profile-error-jwt' },
  });
  assert.equal(unavailableOnboardingDashboard.status, 200);
  const unavailableOnboardingHtml = await unavailableOnboardingDashboard.text();
  assert.match(
    unavailableOnboardingHtml,
    /Certaines étapes n’ont pas pu être vérifiées/,
  );
  assert.match(unavailableOnboardingHtml, /À vérifier/);

  const managerDashboard = await fetch(`${base}/dashboard`, {
    headers: { Cookie: 'konatech_session=manager-jwt' },
    redirect: 'manual',
  });
  await assertRedirectsToMyAttendance(managerDashboard);

  const dashboardErrorPage = await fetch(`${base}/dashboard`, {
    headers: { Cookie: 'konatech_session=dashboard-error-jwt' },
  });
  assert.ok([200, 500].includes(dashboardErrorPage.status));
  assert.match(await dashboardErrorPage.text(), /Dashboard unavailable/);

  const dashboardLoadingSource = await readFile(
    resolve(frontend, 'app/loading.tsx'),
    'utf8',
  );
  assert.match(dashboardLoadingSource, /export default function Loading/);
  assert.match(dashboardLoadingSource, /MetricSkeleton/);

  const dashboardErrorSource = await readFile(
    resolve(frontend, 'app/error.tsx'),
    'utf8',
  );
  assert.match(dashboardErrorSource, /Le tableau de bord/);
  assert.match(dashboardErrorSource, /Réessayer/);

  const ownerSitesPage = await fetch(`${base}/sites`, {
    headers: { Cookie: 'konatech_session=owner-jwt' },
    redirect: 'manual',
  });
  assert.equal(ownerSitesPage.status, 200);
  const ownerSitesHtml = await ownerSitesPage.text();
  assert.match(ownerSitesHtml, /Sites de présence/);
  assert.match(ownerSitesHtml, /Aucun site de présence/);
  assert.match(ownerSitesHtml, /0[^<]*\/[^<]*3/);

  const memberSitesPage = await fetch(`${base}/sites`, {
    headers: { Cookie: 'konatech_session=member-jwt' },
    redirect: 'manual',
  });
  if (memberSitesPage.status === 307) {
    assert.equal(memberSitesPage.headers.get('location'), '/my-attendance');
  } else {
    // Next.js development streaming can encode a server redirect in a 200
    // response after the document shell has started.
    const memberSitesHtml = await memberSitesPage.text();
    assert.match(memberSitesHtml, /my-attendance/);
    assert.doesNotMatch(memberSitesHtml, /Sites configurés/);
  }

  const teamPage = await fetch(`${base}/employees`, {
    headers: { Cookie: 'konatech_session=owner-jwt' },
  });
  assert.equal(teamPage.status, 200);
  const teamHtml = await teamPage.text();
  assert.match(teamHtml, /<h1[^>]*>Employés<\/h1>/);
  assert.doesNotMatch(teamHtml, /Comptes organisation|Employés de pointage/);
  assert.doesNotMatch(teamHtml, /id="members"|id="invitations"/);
  assert.match(
    teamHtml,
    /aria-current="page"[^>]*href="\/organization\/employees"/,
  );

  const employeeViewPage = await fetch(`${base}/employees?view=employees`, {
    headers: { Cookie: 'konatech_session=owner-jwt' },
  });
  assert.equal(employeeViewPage.status, 200);
  const employeeViewHtml = await employeeViewPage.text();
  assert.match(employeeViewHtml, /<h1[^>]*>Employés<\/h1>/);
  assert.match(
    employeeViewHtml,
    /aria-current="page"[^>]*href="\/organization\/employees"/,
  );

  const invitationViewPage = await fetch(`${base}/employees?view=invitations`, {
    headers: { Cookie: 'konatech_session=owner-jwt' },
    redirect: 'manual',
  });
  if (invitationViewPage.status === 307)
    assert.equal(
      invitationViewPage.headers.get('location'),
      '/organization/invitations',
    );
  else
    assert.match(await invitationViewPage.text(), /organization\/invitations/);
  const invitationPage = await fetch(`${base}/organization/invitations`, {
    headers: { Cookie: 'konatech_session=owner-jwt' },
  });
  assert.equal(invitationPage.status, 200);
  const invitationHtml = await invitationPage.text();
  assert.match(invitationHtml, /<h1[^>]*>Invitations<\/h1>/);
  assert.match(
    invitationHtml,
    /aria-current="page"[^>]*href="\/organization\/invitations/,
  );
  assert.match(invitationHtml, /id="invitations"/);
  const memberPage = await fetch(`${base}/organization/members`, {
    headers: { Cookie: 'konatech_session=owner-jwt' },
  });
  assert.equal(memberPage.status, 200);
  const memberHtml = await memberPage.text();
  assert.match(memberHtml, /<h1[^>]*>Membres<\/h1>/);
  assert.match(
    memberHtml,
    /aria-current="page"[^>]*href="\/organization\/members/,
  );

  const memberTeamPage = await fetch(`${base}/employees`, {
    headers: { Cookie: 'konatech_session=member-jwt' },
    redirect: 'manual',
  });
  if (memberTeamPage.status === 307) {
    assert.equal(memberTeamPage.headers.get('location'), '/my-attendance');
  } else {
    const memberTeamHtml = await memberTeamPage.text();
    assert.match(memberTeamHtml, /my-attendance/);
  }

  const managerTeamPage = await fetch(`${base}/employees`, {
    headers: { Cookie: 'konatech_session=manager-jwt' },
    redirect: 'manual',
  });
  if (managerTeamPage.status === 307) {
    assert.equal(managerTeamPage.headers.get('location'), '/my-attendance');
  } else {
    const managerTeamHtml = await managerTeamPage.text();
    assert.match(managerTeamHtml, /my-attendance/);
  }

  const ownerSettingsPage = await fetch(`${base}/organization-settings`, {
    headers: { Cookie: 'konatech_session=owner-jwt' },
  });
  assert.equal(ownerSettingsPage.status, 200);
  const ownerSettingsHtml = await ownerSettingsPage.text();
  assert.match(ownerSettingsHtml, /Profil de l’organisation/);
  assert.match(ownerSettingsHtml, /Organisation Sites/);
  assert.match(ownerSettingsHtml, /organisation-sites/);
  assert.match(ownerSettingsHtml, /Etc\/UTC/);
  assert.match(ownerSettingsHtml, /Enregistrer le profil/);

  const unavailableSettingsPage = await fetch(`${base}/organization-settings`, {
    headers: { Cookie: 'konatech_session=profile-error-jwt' },
  });
  assert.equal(unavailableSettingsPage.status, 200);
  assert.match(
    await unavailableSettingsPage.text(),
    /Paramètres indisponibles/,
  );

  const ownerProfileRead = await fetch(`${base}/api/organizations/current`, {
    headers: { Cookie: 'konatech_session=owner-jwt' },
  });
  assert.equal(ownerProfileRead.status, 200);
  assert.equal((await ownerProfileRead.json()).slug, 'organisation-sites');

  const ownerProfileUpdate = await patch(
    `${base}/api/organizations/current`,
    { name: 'Konatech Côte d’Ivoire', timezone: 'Africa/Abidjan' },
    'konatech_session=owner-jwt',
  );
  assert.equal(ownerProfileUpdate.status, 200);
  assert.deepEqual(forwardedOrganizationProfile, {
    name: 'Konatech Côte d’Ivoire',
    timezone: 'Africa/Abidjan',
  });
  assert.equal((await ownerProfileUpdate.json()).timezone, 'Africa/Abidjan');

  const adminProfileUpdate = await patch(
    `${base}/api/organizations/current`,
    { name: 'Organisation administrée' },
    'konatech_session=admin-jwt',
  );
  assert.equal(adminProfileUpdate.status, 200);

  for (const token of ['manager-jwt', 'member-jwt']) {
    const forbiddenProfileUpdate = await patch(
      `${base}/api/organizations/current`,
      { name: 'Modification interdite' },
      `konatech_session=${token}`,
    );
    assert.equal(forbiddenProfileUpdate.status, 403);
  }

  const invalidProfileUpdate = await patch(
    `${base}/api/organizations/current`,
    { timezone: 'Not/A_Timezone' },
    'konatech_session=owner-jwt',
  );
  assert.equal(invalidProfileUpdate.status, 400);
  assert.deepEqual(await invalidProfileUpdate.json(), {
    error: 'timezone must be a valid IANA timezone.',
  });

  {
    const adminNavClientSource = await readFile(
      resolve(frontend, 'components/admin/admin-nav-client.tsx'),
      'utf8',
    );
    assert.match(adminNavClientSource, /\['dashboard', 'Tableau de bord'\]/);
    assert.match(
      adminNavClientSource,
      /\['\/organization\/calendar', 'Calendrier global'\]/,
    );
    assert.match(
      adminNavClientSource,
      /\['\/organization\/sanctions', 'Règles de sanctions'\]/,
    );
    assert.match(
      adminNavClientSource,
      /\['\/organization\/members', 'Membres'\]/,
    );
    assert.doesNotMatch(adminNavClientSource, /\['\/schedules',/);
    assert.doesNotMatch(
      adminNavClientSource,
      /\['\/organization\/attendance', 'Présences aujourd’hui'\]/,
    );
    assert.match(adminNavClientSource, /title: 'Analyse · Tous les sites'/);
    const organizationAttendanceSource = await readFile(
      resolve(frontend, 'app/organization/attendance/page.tsx'),
      'utf8',
    );
    assert.match(organizationAttendanceSource, /getDashboardData\(token\)/);
    assert.match(
      organizationAttendanceSource,
      /membership\?\.role !== 'ADMIN'/,
    );
    assert.match(organizationAttendanceSource, /dashboard\.recentActivity/);

    const organizationCalendarSource = await readFile(
      resolve(frontend, 'components/calendar/calendar-workspace.tsx'),
      'utf8',
    );
    assert.match(organizationCalendarSource, /Calendrier global/);
    assert.match(organizationCalendarSource, /s’appliquent à tous les sites/);

    const siteHistorySource = await readFile(
      resolve(frontend, 'app/site/[siteId]/history/page.tsx'),
      'utf8',
    );
    const siteHistoryFormSource = await readFile(
      resolve(
        frontend,
        'components/attendance-sites/site-history-period-form.tsx',
      ),
      'utf8',
    );
    assert.match(
      siteHistorySource,
      /getSiteHistory\(token, siteId, selectedParams\)/,
    );
    assert.match(siteHistorySource, /selectedParams\.set\('month', month\)/);
    assert.match(
      siteHistorySource,
      /selectedParams\.set\('startDate', startDate\)/,
    );
    assert.match(
      siteHistorySource,
      /selectedParams\.set\('endDate', endDate\)/,
    );
    assert.match(siteHistoryFormSource, /type="month"/);
    assert.match(siteHistoryFormSource, /type="date"/);

    const onboardingDashboardSource = await readFile(
      resolve(frontend, 'app/dashboard/page.tsx'),
      'utf8',
    );
    const onboardingComponentSource = await readFile(
      resolve(frontend, 'components/dashboard/owner-onboarding-checklist.tsx'),
      'utf8',
    );
    assert.match(onboardingDashboardSource, /activeSites\.length === 1/);
    assert.match(onboardingDashboardSource, /siteAction: 'schedules'/);
    assert.match(onboardingDashboardSource, /siteAction: 'qr'/);
    assert.match(
      onboardingComponentSource,
      /sites\.filter\(\(site\) => site\.isActive\)\.length > 1/,
    );
    assert.match(
      onboardingComponentSource,
      /encodeURIComponent\(site\.id\).*step\.siteAction/,
    );

    const siteLayoutSource = await readFile(
      resolve(frontend, 'app/site/[siteId]/layout.tsx'),
      'utf8',
    );
    assert.doesNotMatch(siteLayoutSource, /href="\/dashboard"/);
  }

  const ownerSubscriptionPage = await fetch(`${base}/subscription`, {
    headers: { Cookie: 'konatech_session=owner-jwt' },
  });
  assert.equal(ownerSubscriptionPage.status, 200);
  const ownerSubscriptionHtml = await ownerSubscriptionPage.text();
  assert.match(ownerSubscriptionHtml, /Abonnement · Pro/);
  assert.match(ownerSubscriptionHtml, /Statut : Actif/);
  assert.match(ownerSubscriptionHtml, /Employés actifs/);
  assert.match(ownerSubscriptionHtml, /administrateurs/i);
  assert.match(ownerSubscriptionHtml, /Sites de présence/);
  assert.match(ownerSubscriptionHtml, /données historiques conservées/);
  assert.match(ownerSubscriptionHtml, /Exports sur période personnalisée/);
  assert.match(ownerSubscriptionHtml, /Inclus/);
  assert.doesNotMatch(
    ownerSubscriptionHtml,
    /Support\s*:\s*(?:standard|priority|premium)/i,
  );
  assert.match(ownerSubscriptionHtml, /Détails du plan/);
  assert.match(ownerSubscriptionHtml, /Aucun paiement n’est traité/);
  assert.doesNotMatch(ownerSubscriptionHtml, /Acheter|Payer|Checkout/);
  const subscriptionPageSource = await readFile(
    resolve(frontend, 'app/subscription/page.tsx'),
    'utf8',
  );
  assert.match(subscriptionPageSource, /catch\s*\{\s*redirect\('\/'\);\s*\}/);

  for (const [token, expectedLabels] of [
    ['subscription-trial-jwt', ['Essai']],
    ['subscription-expired-jwt', ['Expiré']],
    ['subscription-suspended-jwt', ['Suspendu']],
    [
      'subscription-pending-jwt',
      ['Changement planifié', 'Plan suivant', 'Starter'],
    ],
  ]) {
    const statePage = await fetch(`${base}/subscription`, {
      headers: { Cookie: `konatech_session=${token}` },
    });
    assert.equal(statePage.status, 200);
    const stateHtml = await statePage.text();
    for (const label of expectedLabels)
      assert.match(stateHtml, new RegExp(label));
  }

  const memberSubscriptionPage = await fetch(
    `${base}/organization/subscription`,
    {
      headers: { Cookie: 'konatech_session=member-jwt' },
      redirect: 'manual',
    },
  );
  if (memberSubscriptionPage.status === 307) {
    assert.equal(
      memberSubscriptionPage.headers.get('location'),
      '/my-attendance',
    );
  } else {
    const memberSubscriptionHtml = await memberSubscriptionPage.text();
    assert.match(memberSubscriptionHtml, /my-attendance/);
    assert.doesNotMatch(memberSubscriptionHtml, /Utilisation des quotas/);
  }

  const unavailableSubscriptionPage = await fetch(
    `${base}/organization/subscription`,
    {
      headers: { Cookie: 'konatech_session=subscription-error-jwt' },
      redirect: 'manual',
    },
  );
  assert.equal(unavailableSubscriptionPage.status, 200);
  await unavailableSubscriptionPage.text();

  const missingSubscriptionPage = await fetch(
    `${base}/organization/subscription`,
    {
      headers: { Cookie: 'konatech_session=subscription-missing-jwt' },
      redirect: 'manual',
    },
  );
  assert.equal(missingSubscriptionPage.status, 200);
  await missingSubscriptionPage.text();

  const managerSettingsPage = await fetch(`${base}/organization/settings`, {
    headers: { Cookie: 'konatech_session=manager-jwt' },
    redirect: 'manual',
  });
  if (managerSettingsPage.status === 307) {
    assert.equal(managerSettingsPage.headers.get('location'), '/my-attendance');
  } else {
    const managerSettingsHtml = await managerSettingsPage.text();
    assert.match(managerSettingsHtml, /my-attendance/);
  }

  const managerSchedulesPage = await fetch(`${base}/schedules`, {
    headers: { Cookie: 'konatech_session=manager-jwt' },
    redirect: 'manual',
  });
  await assertRedirectsToMyAttendance(managerSchedulesPage);

  const managerSitesPage = await fetch(`${base}/sites`, {
    headers: { Cookie: 'konatech_session=manager-jwt' },
    redirect: 'manual',
  });
  await assertRedirectsToMyAttendance(managerSitesPage);

  const managerCalendarPage = await fetch(
    `${base}/organization/calendar?month=2026-09`,
    {
      headers: { Cookie: 'konatech_session=manager-jwt' },
      redirect: 'manual',
    },
  );
  await assertRedirectsToMyAttendance(managerCalendarPage);

  const managerSanctionsPage = await fetch(
    `${base}/organization/sanctions?tab=rules&month=2026-09`,
    {
      headers: { Cookie: 'konatech_session=manager-jwt' },
      redirect: 'manual',
    },
  );
  await assertRedirectsToMyAttendance(managerSanctionsPage);

  const memberAttendancePage = await fetch(`${base}/my-attendance`, {
    headers: { Cookie: 'konatech_session=member-jwt' },
  });
  assert.equal(memberAttendancePage.status, 200);
  const memberAttendanceHtml = await memberAttendancePage.text();
  assert.match(memberAttendanceHtml, /Compte organisation/);
  assert.match(memberAttendanceHtml, /aucun profil employé/);
  assert.match(memberAttendanceHtml, /Mon pointage/);
  assert.doesNotMatch(memberAttendanceHtml, />Organisation</);
  assert.doesNotMatch(memberAttendanceHtml, /Abonnement et quotas/);
  assert.doesNotMatch(memberAttendanceHtml, />Employés</);
  assert.doesNotMatch(memberAttendanceHtml, /Tableau de bord/);

  forwardedInvitation = null;
  const invitationResponse = await post(
    `${base}/api/team/invitations`,
    { email: 'invitee@example.test' },
    'konatech_session=owner-jwt',
  );
  assert.equal(invitationResponse.status, 201);
  assert.match(
    invitationResponse.headers.get('cache-control') ?? '',
    /no-store/,
  );
  assert.deepEqual(forwardedInvitation, { email: 'invitee@example.test' });
  const invitationBody = await invitationResponse.json();
  assert.equal(invitationBody.invitation.email, 'invitee@example.test');
  assert.equal(invitationBody.invitation.invitationToken, undefined);
  assert.equal(invitationBody.invitationToken, 'must-not-reach-the-browser');

  forwardedInvitationAcceptance = null;
  const acceptanceResponse = await post(`${base}/api/invitations/accept`, {
    token: 'secure-invitation-token-value',
    password: 'InvitationPassword123!',
  });
  assert.equal(acceptanceResponse.status, 201);
  assert.match(
    acceptanceResponse.headers.get('cache-control') ?? '',
    /no-store/,
  );
  assert.deepEqual(forwardedInvitationAcceptance, {
    token: 'secure-invitation-token-value',
    password: 'InvitationPassword123!',
  });
  assert.deepEqual(await acceptanceResponse.json(), {
    accepted: true,
    organization: { id: 'organization-sites', name: 'Organisation Sites' },
  });

  forwardedAttendanceSite = null;
  const createdSite = await post(
    `${base}/api/attendance-sites`,
    {
      name: 'Siège',
      latitude: 5.359952,
      longitude: -4.008256,
      allowedRadiusMeters: 120,
    },
    'konatech_session=owner-jwt',
  );
  assert.equal(createdSite.status, 201);
  assert.deepEqual(forwardedAttendanceSite, {
    name: 'Siège',
    latitude: 5.359952,
    longitude: -4.008256,
    allowedRadiusMeters: 120,
  });

  const reconciliationDecisionUrl = `${base}/api/attendance/offline-reconciliation/11111111-1111-4111-8111-111111111111/approve`;
  for (const origin of [undefined, 'https://attacker.example']) {
    const denied = await fetch(reconciliationDecisionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'konatech_session=final-account-jwt',
        ...(origin ? { Origin: origin } : {}),
      },
      body: JSON.stringify({ reason: 'Reviewed evidence' }),
    });
    assert.equal(denied.status, 403);
    assert.match((await denied.json()).error, /Origine/);
  }
  const sameOriginDecision = await fetch(reconciliationDecisionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'konatech_session=final-account-jwt',
      Origin: base,
    },
    body: JSON.stringify({ reason: 'Reviewed evidence' }),
  });
  // The mock backend has no reconciliation resource; 404 proves forwarding,
  // while missing/foreign origins are rejected before backend authorization.
  assert.equal(sameOriginDecision.status, 404);
  assert.equal(
    sameOriginDecision.headers.get('cache-control'),
    'private, no-store',
  );

  const formSource = await readFile(
    resolve(frontend, 'components/auth/login-form.tsx'),
    'utf8',
  );
  assert.match(formSource, /Choisissez votre organisation/);
  assert.match(formSource, /organizations\.map/);
  assert.match(
    formSource,
    /JSON\.stringify\(\{ organizationId: selectedOrganizationId \}\)/,
  );
  assert.doesNotMatch(
    // Clearing the offline bootstrap is permitted; credential/challenge storage is not.
    formSource.replace(
      /clearActiveOfflineAttendanceBootstrap\(window\.localStorage\);/g,
      '',
    ),
    /localStorage|sessionStorage|organizationSelectionChallenge/,
  );

  const qrSource = await readFile(
    resolve(frontend, 'components/dashboard/attendance-entry-qr-card.tsx'),
    'utf8',
  );
  assert.match(qrSource, /searchParams\.set\('sitePublicId'/);

  const attendanceEntryPageSource = await readFile(
    resolve(frontend, 'app/attendance-entry/page.tsx'),
    'utf8',
  );
  assert.match(
    attendanceEntryPageSource,
    /attendanceEntryRedirectTo=\{attendanceEntryRedirectTo\}/,
  );

  const adminNavSource = await readFile(
    resolve(frontend, 'components/admin/admin-nav.tsx'),
    'utf8',
  );
  const adminNavClientSource = await readFile(
    resolve(frontend, 'components/admin/admin-nav-client.tsx'),
    'utf8',
  );
  assert.match(adminNavClientSource, /\['\/sites', 'Sites'\]/);
  assert.match(
    adminNavClientSource,
    /aria-current=\{selected \? 'page' : undefined\}/,
  );
  assert.match(
    adminNavClientSource,
    /router\.push\(`\/site\/\$\{encodeURIComponent\(event\.target\.value\)\}\/dashboard`\)/,
  );
  assert.match(
    adminNavClientSource,
    /activeSites = sites\.filter\(\(site\) => site\.isActive\)/,
  );
  assert.match(adminNavClientSource, /title: 'Analyse · Tous les sites'/);
  assert.doesNotMatch(
    adminNavClientSource,
    /\['\/organization\/attendance', 'Présences aujourd’hui'\]/,
  );
  assert.match(adminNavClientSource, /Vue d’ensemble organisation/);
  assert.match(adminNavSource, /membershipRole === 'EMPLOYEE'/);
  const employeeManifestSource = await readFile(
    resolve(frontend, 'lib/employee-manifest.ts'),
    'utf8',
  );
  assert.match(employeeManifestSource, /scope: startUrl/);
  const rootLayoutSource = await readFile(
    resolve(frontend, 'app/layout.tsx'),
    'utf8',
  );
  assert.doesNotMatch(rootLayoutSource, /ServiceWorkerRegistration|manifest:/);

  const employeeManagerSource = await readFile(
    resolve(frontend, 'components/employees/admin-employees-manager.tsx'),
    'utf8',
  );
  assert.match(employeeManagerSource, /editingEmployee\?\.pinConfigured/);
  assert.match(employeeManagerSource, /Laisser vide pour conserver/);
  assert.doesNotMatch(employeeManagerSource, /employee\.pinCodeHash/);
  assert.match(employeeManagerSource, /Plan quota reached for activeEmployees/);
  assert.match(employeeManagerSource, /employeeCapacity\.activeEmployees/);
  assert.match(employeeManagerSource, /Employés actifs:/);
  assert.match(employeeManagerSource, /window\.confirm\(/);

  const siteManagerSource = await readFile(
    resolve(frontend, 'components/attendance-sites/attendance-sites-manager.tsx'),
    'utf8',
  );
  assert.match(siteManagerSource, /onClick=\{\(\) => setSiteStatusChange\(site\)\}/);
  assert.match(siteManagerSource, /Les pointages hors ligne en attente seront réévalués/);

  const reconciliationSource = await readFile(
    resolve(frontend, 'components/reconciliation/reconciliation-workspace.tsx'),
    'utf8',
  );
  assert.match(reconciliationSource, /setDecisionToConfirm\('approve'\)/);
  assert.match(reconciliationSource, /setDecisionToConfirm\('reject'\)/);
  assert.match(reconciliationSource, /Confirmer la prise en compte/);

  const historyTableSource = await readFile(
    resolve(frontend, 'components/attendance-history/attendance-history-table.tsx'),
    'utf8',
  );
  assert.match(historyTableSource, /record\.attendanceSite\?\.name/);
  assert.match(historyTableSource, /Afficher le détail du pointage de/);
  const historyWorkspaceSource = await readFile(
    resolve(frontend, 'components/attendance-history/attendance-history-workspace.tsx'),
    'utf8',
  );
  assert.match(historyWorkspaceSource, /Réessayer/);

  const teamAccountsSource = await readFile(
    resolve(frontend, 'components/team/team-accounts-manager.tsx'),
    'utf8',
  );
  const invitationProxySource = await readFile(
    resolve(frontend, 'app/api/team/invitations/route.ts'),
    'utf8',
  );
  assert.match(invitationProxySource, /headers: \{ 'Cache-Control': 'no-store' \}/);
  assert.doesNotMatch(invitationProxySource, /console\./);
  assert.match(teamAccountsSource, /if \(!open\) \{ setAcceptanceUrl\(''\); setCopyMessage\(''\); \}/);
  assert.match(teamAccountsSource, /Copier le lien secret/);
  assert.doesNotMatch(teamAccountsSource, /localStorage|sessionStorage/);

  const qrCardSource = await readFile(
    resolve(frontend, 'components/dashboard/attendance-entry-qr-card.tsx'),
    'utf8',
  );
  assert.match(qrCardSource, /loadImage\('\/brand\/inout-logo\.png'\)/);
  assert.match(qrCardSource, /inout-attendance-entry-qr-poster\.pdf/);
  assert.doesNotMatch(qrCardSource, /\/konatech-logo\.png/);
  await readFile(resolve(frontend, 'public/brand/inout-logo.png'));
  for (const file of ['public/offline.html', 'public/sw.js']) {
    const source = await readFile(resolve(frontend, file), 'utf8');
    assert.match(source, /\/brand\/inout-logo\.png/);
    assert.doesNotMatch(source, /\/konatech-logo\.png/);
  }
  const sanctionsSource = await readFile(
    resolve(frontend, 'components/sanctions/sanction-rules-panel.tsx'),
    'utf8',
  );
  assert.doesNotMatch(
    sanctionsSource,
    /<Button disabled size="sm" variant="secondary">\s*Désactiver/,
  );

  console.log(
    'Frontend authentication, attendance-entry and team checks passed.',
  );
} finally {
  await stopNextServer(next);
  await new Promise((resolveClose) => backend.close(resolveClose));
}
