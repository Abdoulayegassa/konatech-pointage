export type AccessRole = 'ADMIN' | 'EMPLOYEE';
export type WorkDay =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

export type AuthenticatedUser = {
  id: string;
  employeeIdentifier: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  accessRole: AccessRole;
  department: string | null;
  isActive: boolean;
  scheduleId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Schedule = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  latenessMarginMinutes: number;
  isActive: boolean;
  workDays: WorkDay[];
  createdAt: string;
  updatedAt: string;
};

export type ScheduleRecord = Schedule & {
  employees: AuthenticatedUser[];
};

export type AuthenticatedEmployee = AuthenticatedUser & {
  schedule?: Schedule | null;
};

export type EmployeeRecord = AuthenticatedEmployee & {
  pinConfigured: boolean;
};

export type CreateEmployeePayload = {
  pinCode?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  accessRole: AccessRole;
  password: string;
  department?: string | null;
  isActive?: boolean;
  scheduleId?: string | null;
};

export type UpdateEmployeePayload = {
  pinCode?: string | null;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  accessRole?: AccessRole;
  password?: string;
  department?: string | null;
  isActive?: boolean;
  scheduleId?: string | null;
};

export type CreateSchedulePayload = {
  name: string;
  startTime: string;
  endTime: string;
  latenessMarginMinutes?: number;
  isActive?: boolean;
  workDays: WorkDay[];
};

export type UpdateSchedulePayload = {
  name?: string;
  startTime?: string;
  endTime?: string;
  latenessMarginMinutes?: number;
  isActive?: boolean;
  workDays?: WorkDay[];
};

export type LoginResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: AuthenticatedUser;
};

export type DashboardActivityItem = {
  id: string;
  employeeId: string;
  employeeIdentifier: string;
  employeeName: string;
  department: string | null;
  status: 'PRESENT' | 'LATE' | 'INCOMPLETE' | 'ABSENT';
  date: string;
  clockInAt: string | null;
  clockOutAt: string | null;
  outsideScheduleWork: boolean;
  scheduledExitTime: string | null;
  earlyExit: boolean;
  earlyExitMinutes: number;
  overtimeHours: number;
  overtimeMinutes: number;
  absenceCount: number;
  minutesLate: number;
  notes: string | null;
  checkInDistanceMeters: number | null;
  checkInVerificationMethod: AttendanceVerificationMethod;
  checkInVerificationLevel: AttendanceVerificationLevel;
  checkInVerificationReason: string | null;
  checkInVerificationPhoto: string | null;
  checkInVerificationPhotoPublicId: string | null;
  checkOutDistanceMeters: number | null;
  checkOutVerificationMethod: AttendanceVerificationMethod;
  checkOutVerificationLevel: AttendanceVerificationLevel;
  checkOutVerificationReason: string | null;
  checkOutVerificationPhoto: string | null;
  checkOutVerificationPhotoPublicId: string | null;
};

export type DashboardTopLateEmployee = {
  employeeId: string;
  employeeIdentifier: string;
  employeeName: string;
  department: string | null;
  lateCount: number;
  totalMinutesLate: number;
  averageMinutesLate: number;
};

export type DashboardTopSuspiciousEmployee = {
  employeeId: string;
  employeeIdentifier: string;
  employeeName: string;
  department: string | null;
  legacySensitiveCount: number;
  legacyWarningCount: number;
  legacyStrictCount: number;
  legacyPhotoVerificationCount: number;
  suspiciousCount: number;
  warningCount: number;
  strictCount: number;
  photoVerificationCount: number;
  maxDistanceMeters: number | null;
};

export type DashboardTopOvertimeEmployee = {
  employeeId: string;
  employeeIdentifier: string;
  employeeName: string;
  department: string | null;
  overtimeHours: number;
};

export type DashboardTopEarlyExitEmployee = {
  employeeId: string;
  employeeIdentifier: string;
  employeeName: string;
  department: string | null;
  earlyExitCount: number;
  totalEarlyExitMinutes: number;
};

export type DashboardAnalytics = {
  attendanceRate: number;
  latenessRate: number;
  absenceRate: number;
  absenceCountThisMonth: number;
  outsideScheduleWorkDays: number;
  outsideScheduleOvertimeHoursThisMonth: number;
  gpsValidatedCheckInCount: number;
  gpsValidatedCheckOutCount: number;
  gpsValidatedAttendanceCount: number;
  insideZoneCheckInCount: number;
  insideZoneCheckOutCount: number;
  insideZoneAttendanceCount: number;
  blockedCheckInCount: number | null;
  blockedCheckOutCount: number | null;
  blockedAttendanceAttemptCount: number | null;
  outsideZoneRejectedAttemptCount: number | null;
  legacySensitiveCheckInCount: number;
  legacySensitiveCheckOutCount: number;
  legacyHistoricalVerificationCount: number;
  legacyPhotoCheckInCount: number;
  legacyPhotoCheckOutCount: number;
  legacyHistoricalPhotoCount: number;
  suspiciousCheckInCount: number;
  suspiciousCheckOutCount: number;
  earlyExitCount: number;
  overtimeHoursThisMonth: number;
  photoVerificationCount: number;
  checkOutPhotoVerificationCount: number;
  topLateEmployees: DashboardTopLateEmployee[];
  topLegacySecurityEmployees?: DashboardTopSuspiciousEmployee[];
  topSuspiciousEmployees?: DashboardTopSuspiciousEmployee[];
  topOvertimeEmployees: DashboardTopOvertimeEmployee[];
  topEarlyExitEmployees: DashboardTopEarlyExitEmployee[];
};

export type DashboardOverview = {
  generatedAt: string;
  date: string;
  summary: {
    totalEmployees: number;
    presentToday: number;
    lateEmployeesToday: number;
    absentEmployeesToday: number;
    earlyExitToday: number;
    overtimeHoursToday: number;
    totalAttendanceRecordsToday: number;
  };
  analytics: DashboardAnalytics;
  recentActivity: DashboardActivityItem[];
};

export type AttendanceVerificationMethod = 'NONE' | 'GPS' | 'PHOTO';
export type AttendanceVerificationLevel = 'OK' | 'WARNING' | 'STRICT';
export type AttendanceSecurityPhotoRequiredReason =
  | 'LOCATION_UNAVAILABLE'
  | 'OUTSIDE_ALLOWED_RADIUS';

export type AttendanceSecurityChallenge = {
  photoRequired: boolean;
  reason: AttendanceSecurityPhotoRequiredReason;
  retryableWithPhoto: boolean;
};

export type AttendanceSecurityPolicy = {
  enabled: boolean;
  locationConfigured: boolean;
  trustedRadiusMeters?: number | null;
  warningRadiusMeters?: number | null;
  allowedRadiusMeters: number | null;
  maxAccuracyMeters?: number | null;
  companyLatitude: number | null;
  companyLongitude: number | null;
};

export type AttendanceRecord = {
  id: string;
  employeeId: string;
  date: string;
  clockInAt: string | null;
  clockOutAt: string | null;
  outsideScheduleWork: boolean;
  scheduledExitTime: string | null;
  earlyExit: boolean;
  earlyExitMinutes: number;
  overtimeHours: number;
  overtimeMinutes: number;
  absenceCount: number;
  status: 'PRESENT' | 'LATE' | 'INCOMPLETE' | 'ABSENT';
  minutesLate: number;
  notes: string | null;
  checkInLatitude: number | null;
  checkInLongitude: number | null;
  checkInAccuracyMeters: number | null;
  checkInDistanceMeters: number | null;
  checkInVerificationMethod: AttendanceVerificationMethod;
  checkInVerificationLevel: AttendanceVerificationLevel;
  checkInVerificationReason: string | null;
  checkInVerificationPhoto: string | null;
  checkInVerificationPhotoPublicId: string | null;
  checkOutLatitude: number | null;
  checkOutLongitude: number | null;
  checkOutAccuracyMeters: number | null;
  checkOutDistanceMeters: number | null;
  checkOutVerificationMethod: AttendanceVerificationMethod;
  checkOutVerificationLevel: AttendanceVerificationLevel;
  checkOutVerificationReason: string | null;
  checkOutVerificationPhoto: string | null;
  checkOutVerificationPhotoPublicId: string | null;
  createdAt?: string;
  updatedAt?: string;
  employee: AuthenticatedUser;
};

export type EmployeeTodayAttendance = {
  date: string;
  expectedToday: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  securityPolicy?: AttendanceSecurityPolicy;
  attendance: AttendanceRecord | null;
  employee: AuthenticatedEmployee;
};

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

function normalizeAbsoluteUrl(value: string, envName: string) {
  try {
    return new URL(value).toString().replace(/\/$/, '');
  } catch {
    throw new Error(`${envName} must be a valid absolute URL.`);
  }
}

function isLocalhostUrl(value: string) {
  const hostname = new URL(value).hostname;

  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0'
  );
}

function isHttpsUrl(value: string) {
  return new URL(value).protocol === 'https:';
}

function isTunnelUrl(value: string) {
  const hostname = new URL(value).hostname.toLowerCase();

  return [
    '.trycloudflare.com',
    '.ngrok-free.app',
    '.ngrok.io',
    '.loca.lt',
  ].some((suffix) => hostname.endsWith(suffix));
}

function isPrivateNetworkUrl(value: string) {
  const hostname = new URL(value).hostname;

  return (
    /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
    /^192\.168\.\d+\.\d+$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(hostname)
  );
}

function resolveConfiguredUrl(
  envName: 'API_BASE_URL' | 'NEXT_PUBLIC_API_BASE_URL' | 'NEXT_PUBLIC_APP_URL',
  options: {
    developmentFallback?: string;
    requiredInProduction: boolean;
  },
) {
  const configuredValue = process.env[envName]?.trim();

  if (!configuredValue) {
    if (process.env.NODE_ENV !== 'production') {
      return options.developmentFallback ?? null;
    }

    if (!options.requiredInProduction) {
      return null;
    }

    throw new Error(`${envName} must be configured in production.`);
  }

  const normalizedUrl = normalizeAbsoluteUrl(configuredValue, envName);

  if (process.env.NODE_ENV === 'production' && isLocalhostUrl(normalizedUrl)) {
    throw new Error(`${envName} cannot point to localhost in production.`);
  }

  if (process.env.NODE_ENV === 'production' && !isHttpsUrl(normalizedUrl)) {
    throw new Error(`${envName} must use HTTPS in production.`);
  }

  if (process.env.NODE_ENV === 'production' && isTunnelUrl(normalizedUrl)) {
    throw new Error(
      `${envName} cannot use a temporary tunnel hostname in production.`,
    );
  }

  if (
    process.env.NODE_ENV === 'production' &&
    isPrivateNetworkUrl(normalizedUrl)
  ) {
    throw new Error(
      `${envName} cannot point to a private network IP in production.`,
    );
  }

  if (
    (envName === 'API_BASE_URL' || envName === 'NEXT_PUBLIC_API_BASE_URL') &&
    !new URL(normalizedUrl).pathname.endsWith('/api/v1')
  ) {
    throw new Error(`${envName} must end with /api/v1.`);
  }

  return normalizedUrl;
}

export function getApiBaseUrl() {
  return resolveConfiguredUrl('NEXT_PUBLIC_API_BASE_URL', {
    developmentFallback: 'http://localhost:4000/api/v1',
    requiredInProduction: true,
  }) as string;
}

export function getServerApiBaseUrl() {
  if (process.env.API_BASE_URL?.trim()) {
    return resolveConfiguredUrl('API_BASE_URL', {
      developmentFallback: 'http://localhost:4000/api/v1',
      requiredInProduction: true,
    }) as string;
  }

  return getApiBaseUrl();
}

export function getPublicAppUrl() {
  return resolveConfiguredUrl('NEXT_PUBLIC_APP_URL', {
    requiredInProduction: true,
  });
}

export function normalizeApiPath(path: string) {
  const normalizedPath = path.trim();

  if (!normalizedPath) {
    return '';
  }

  return `/${normalizedPath.replace(/^\/+/, '')}`;
}

export function buildApiUrl(
  path: string,
  options: {
    server?: boolean;
  } = {},
) {
  const baseUrl = options.server ? getServerApiBaseUrl() : getApiBaseUrl();

  return `${baseUrl}${normalizeApiPath(path)}`;
}

export async function fetchServerApi(path: string, init: RequestInit = {}) {
  return fetch(buildApiUrl(path, { server: true }), {
    ...init,
    cache: init.cache ?? 'no-store',
  });
}

async function parseErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string | string[] };

    if (Array.isArray(payload.message)) {
      return payload.message.join(', ');
    }

    if (typeof payload.message === 'string') {
      return payload.message;
    }
  } catch {
    // Ignore JSON parsing issues and fall back to the status text.
  }

  return response.statusText || `Request failed with ${response.status}`;
}

export async function requestApi<T>(
  path: string,
  options: RequestInit & {
    token?: string;
  } = {},
): Promise<T> {
  const headers = new Headers(options.headers);

  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetchServerApi(path, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new ApiRequestError(
      await parseErrorMessage(response),
      response.status,
    );
  }

  return (await response.json()) as T;
}

export async function getDashboardData(token: string) {
  return requestApi<DashboardOverview>('/dashboard/overview', { token });
}

export async function getCurrentUserFromApi(token: string) {
  return requestApi<AuthenticatedUser>('/auth/me', { token });
}

export async function getEmployeeAttendanceData(token: string, month: string) {
  const [today, history] = await Promise.all([
    requestApi<EmployeeTodayAttendance>('/attendance/me/today', { token }),
    requestApi<AttendanceRecord[]>(
      `/attendance/me/history?month=${encodeURIComponent(month)}`,
      { token },
    ),
  ]);

  return {
    today,
    history,
  };
}

export async function getEmployeesData(token: string) {
  const [employees, schedules] = await Promise.all([
    requestApi<EmployeeRecord[]>('/employees', { token }),
    requestApi<Schedule[]>('/schedules', { token }),
  ]);

  return {
    employees,
    schedules,
  };
}

export async function getSchedulesData(token: string) {
  return requestApi<ScheduleRecord[]>('/schedules', { token });
}
