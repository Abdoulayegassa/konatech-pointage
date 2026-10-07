export type AccessRole = 'ADMIN' | 'EMPLOYEE';
export type MembershipRole = 'ADMIN' | 'EMPLOYEE';
export type MembershipStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
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
  primarySiteId?: string | null;
  primarySite?: Pick<AttendanceSite, 'id' | 'name' | 'isActive'> | null;
  scheduleId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Opaque server-derived value for binding offline work to this session. */
  offlineSessionBinding?: string | null;
  membership?: {
    id: string;
    role: MembershipRole;
  };
  employee?: { id: string } | null;
  organization?: OrganizationSummary;
};

export type OrganizationAttendanceSettings = {
  organizationId: string;
  gpsRequired: boolean | null;
  selfieRequired: boolean | null;
  allowedRadiusMeters: number | null;
  defaultLatenessMarginMinutes: number | null;
  defaultWorkDays: WorkDay[] | null;
};

export type OrganizationProfile = {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  timezone: string;
  logoUrl: string | null;
  primaryColor: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AttendanceSite = {
  id: string;
  publicId: string;
  name: string;
  latitude: number;
  longitude: number;
  allowedRadiusMeters: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SitePage<T> = {
  site: Pick<AttendanceSite, 'id' | 'name'> &
    Partial<Pick<AttendanceSite, 'isActive'>>;
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type SiteEmployeeRecord = AuthenticatedUser & {
  effectiveAssignment: {
    id: string;
    effectiveFrom: string;
    effectiveTo: string | null;
  } | null;
  currentSchedule: Schedule | null;
};

export type SiteScheduleRecord = Schedule & {
  currentAssignedEmployeeCount: number;
};

export type SiteDashboardOverview = {
  site: Pick<AttendanceSite, 'id' | 'name' | 'isActive'>;
  date: string;
  organizationTimezone: string;
  activeEmployees: number;
  presentToday: number;
  lateToday: number;
  earlyExitToday: number;
  overtimeHoursToday: number;
  recentAttendance: Array<{
    id: string;
    date: string;
    status: AttendanceRecordStatus;
    clockInAt: string | null;
    clockOutAt: string | null;
    minutesLate: number;
    earlyExit: boolean;
    overtimeHours: number;
    employee: Pick<
      AuthenticatedUser,
      'id' | 'firstName' | 'lastName' | 'employeeIdentifier'
    >;
  }>;
};

export type SiteAttendanceReportRow = {
  fullName: string;
  employeeIdentifier: string;
  department: string;
  assignedSchedule: string;
  workingDays: number;
  presenceDays: number;
  totalWorkedDays: number;
  outsideScheduleWorkDays: number;
  entryCount: number;
  exitCount: number;
  lateDays: number;
  absentDays: number;
  absenceCount: number;
  incompleteAttendanceDays: number;
  totalWorkedHours: string;
  earlyExitDays: number;
  earlyExitMinutes: number;
  scheduledOvertimeHours: string;
  outsideScheduleOvertimeHours: string;
  overtimeHours: string;
};

export type SiteAttendanceReportEmployee = {
  fullName: string;
  employeeIdentifier: string;
  departmentLabel: string;
  assignedScheduleLabel: string;
  monthLabel: string;
  generationDateLabel: string;
  workingDays: number;
  presenceDays: number;
  presenceRate: number;
  absenceCount: number;
  outsideScheduleWorkDays: number;
  entryCount: number;
  exitCount: number;
  totalWorkedHours: string;
  scheduledOvertimeHours: string;
  outsideScheduleOvertimeHours: string;
  overtimeHours: string;
  earlyExitCount: number;
  lateCount: number;
  performanceScore: number;
  lateBreakdown: {
    minorCount: number;
    moderateCount: number;
    criticalCount: number;
  };
  lateRangeBreakdown: {
    fiveToFifteenCount: number;
    sixteenToThirtyCount: number;
    overThirtyCount: number;
  };
  exitBreakdown: {
    normalExitCount: number;
    earlyExitCount: number;
    overtimeDayCount: number;
    overtimeHours: string;
    outsideScheduleWorkDays: number;
    outsideScheduleOvertimeHours: string;
  };
  gpsBreakdown: {
    gpsValidatedPointages: number;
    nonGpsPointages: number;
    insideZonePointages: number;
    outsideZoneAttempts: number | null;
    modeLabel: string;
  };
  sanctionSummary: {
    minorLatenessCount: number;
    majorLatenessCount: number;
    toleratedCount: number;
    appliedCount: number;
    totalAmount: number;
    totalAmountLabel: string;
    recommendation: string;
  };
  dailyRows: Array<{
    date: string;
    dayLabel: string;
    attendanceSiteId: string | null;
    siteLabel: string;
    clockInTime: string;
    clockOutTime: string;
    statusLabel: string;
    commentLabel: string | null;
    lateLabel: string;
    earlyExitLabel: string;
    workTypeLabel: string;
    overtimeLabel: string;
    gpsVerificationLabel: string;
    sanctionLabel: string;
  }>;
};

export type SiteAttendanceReport = {
  scope: 'SITE';
  organizationId: string;
  organizationName: string;
  siteId: string;
  siteName: string;
  organizationTimezone: string;
  reportingMode: 'monthly' | 'custom';
  periodLabel: string;
  period: { startDate: string; endDate: string };
  month: number;
  year: number;
  generatedAt: string;
  rows: SiteAttendanceReportRow[];
  employeeReport: SiteAttendanceReportEmployee | null;
};

export type SiteAttendanceSettings = {
  organizationId: string;
  siteId: string;
  gpsRequired: boolean | null;
  selfieRequired: boolean | null;
  defaultLatenessMarginMinutes: number | null;
  defaultWorkDays: WorkDay[] | null;
};

/** All current commercial plans supported by the subscription contract. */
export type SubscriptionPlan = 'STARTER' | 'PRO' | 'BUSINESS';
export type SubscriptionStatus =
  | 'TRIALING'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'SUSPENDED'
  | 'PENDING_DOWNGRADE'
  | 'CANCELLED';
export type OrganizationSubscription = {
  subscription: {
    organizationId: string;
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
    startsAt: string;
    endsAt: string;
    graceEndsAt: string;
    trialUsedAt: string | null;
    pendingPlan: SubscriptionPlan | null;
    pendingPlanAt: string | null;
  };
  entitlements: {
    activeEmployees: number;
    activeAdministrators: number;
    activeAttendanceSites: number;
    customExport: boolean;
  };
  usage: {
    activeEmployees: number;
    activeAdministrators: number;
    pendingAdministratorInvitations: number;
    administratorCapacityUsed: number;
    activeAttendanceSites: number;
  };
  notifications?: Array<{
    id: string;
    type: string;
    occurredAt: string;
    message: string;
  }>;
  events?: Array<Record<string, unknown>>;
};

export type OwnerOnboardingStatus = {
  organizationProfile: {
    configured: boolean;
    name: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
    timezone: string;
  };
  subscription: {
    activeAdministratorCount: number;
    pendingAdministratorInvitationCount: number;
    administratorCapacityUsed: number;
    administratorLimit: number;
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
  };
  attendanceSites: { activeCount: number; limit: number };
  employees: { activeCount: number; limit: number; pinConfiguredCount: number };
  schedules: { activeAssignedCount: number };
  attendance: { firstClockInCompleted: boolean };
  qr: { available: boolean };
};

export type UpdateOrganizationAttendanceSettingsPayload = Partial<
  Omit<OrganizationAttendanceSettings, 'organizationId'>
>;

export type Schedule = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  latenessMarginMinutes: number;
  isActive: boolean;
  siteId: string | null;
  workDays: WorkDay[];
  createdAt: string;
  updatedAt: string;
};

export type ScheduleRecord = Schedule & {
  employees: AuthenticatedUser[];
  currentAssignedEmployeeCount?: number;
};

export type AuthenticatedEmployee = AuthenticatedUser & {
  schedule?: Schedule | null;
};

export type EmployeeRecord = AuthenticatedEmployee & {
  pinConfigured: boolean;
};

export type OrganizationMember = {
  id: string;
  userId: string;
  role: MembershipRole;
  status: MembershipStatus;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    normalizedEmail: string;
  };
};

export type OrganizationInvitation = {
  id: string;
  invitedByUserId: string;
  email: string;
  role: MembershipRole;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
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
  siteId: string;
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
  siteId: string;
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
  membership?: {
    id: string;
    role: MembershipRole;
  };
};

export type PlatformLoginResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  platformAdmin: true;
};

export type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
  timezone?: string;
};

export type OrganizationSelectionRequiredResponse = {
  organizationSelectionRequired: true;
  organizations: OrganizationSummary[];
};

export type InitialOrganizationSelectionResponse = {
  redirectTo: string;
  user: AuthenticatedUser;
};

export type AttendanceRecordStatus =
  | 'PRESENT'
  | 'LATE'
  | 'INCOMPLETE'
  | 'ABSENT'
  | 'NON_WORKING_DAY_WORK';

export type DashboardActivityItem = {
  employeeIdentifier: string;
  employeeName: string;
  department: string | null;
  status: AttendanceRecordStatus;
  date: string;
  clockInAt: string | null;
  clockOutAt: string | null;
  earlyExit: boolean;
  earlyExitMinutes: number;
  overtimeHours: number;
  overtimeMinutes: number;
  absenceCount: number;
  minutesLate: number;
};

export type DashboardTopLateEmployee = {
  employeeName: string;
  department: string | null;
  lateCount: number;
  totalMinutesLate: number;
  averageMinutesLate: number;
};

export type DashboardTopOvertimeEmployee = {
  employeeName: string;
  department: string | null;
  overtimeHours: number;
};

export type DashboardTopEarlyExitEmployee = {
  employeeName: string;
  department: string | null;
  earlyExitCount: number;
  totalEarlyExitMinutes: number;
};

export type DashboardAnalytics = {
  absenceCountThisMonth: number;
  earlyExitCount: number;
  overtimeHoursThisMonth: number;
  topLateEmployees: DashboardTopLateEmployee[];
  topOvertimeEmployees: DashboardTopOvertimeEmployee[];
  topEarlyExitEmployees: DashboardTopEarlyExitEmployee[];
};

export type DashboardOverview = {
  generatedAt: string;
  date: string;
  summary: {
    totalEmployees: number;
    presentToday: number;
    scheduledPresentToday: number;
    lateEmployeesToday: number;
    absentEmployeesToday: number;
    earlyExitToday: number;
    overtimeHoursToday: number;
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
  selfieRequired: boolean;
  gpsRequired: boolean;
  locationConfigured: boolean;
  trustedRadiusMeters?: number | null;
  warningRadiusMeters?: number | null;
  allowedRadiusMeters: number | null;
  maxAccuracyMeters?: number | null;
  companyLatitude: number | null;
  companyLongitude: number | null;
  siteId?: string | null;
  siteName?: string | null;
};

export type AttendanceRecord = {
  id: string;
  employeeId: string;
  attendanceSiteId?: string | null;
  attendanceSite?: Pick<AttendanceSite, 'id' | 'publicId' | 'name'> | null;
  date: string;
  clockInAt: string | null;
  clockOutAt: string | null;
  outsideScheduleWork: boolean;
  scheduledExitTime: string | null;
  earlyExit: boolean;
  earlyExitMinutes: number;
  overtimeHours: number;
  overtimeMinutes: number;
  lateExit?: boolean;
  absenceCount: number;
  status: AttendanceRecordStatus;
  minutesLate: number;
  notes: string | null;
  scheduleIdSnapshot?: string | null;
  scheduleNameSnapshot?: string | null;
  scheduleStartTimeSnapshot?: string | null;
  scheduleEndTimeSnapshot?: string | null;
  scheduleWorkDaysSnapshot?: unknown;
  scheduleLatenessMarginSnapshot?: number | null;
  scheduleCapturedAt?: string | null;
  checkInLatitude: number | null;
  checkInLongitude: number | null;
  checkInAccuracyMeters: number | null;
  checkInDistanceMeters: number | null;
  checkInVerificationMethod: AttendanceVerificationMethod;
  checkInVerificationLevel: AttendanceVerificationLevel;
  checkInVerificationReason: string | null;
  checkOutLatitude: number | null;
  checkOutLongitude: number | null;
  checkOutAccuracyMeters: number | null;
  checkOutDistanceMeters: number | null;
  checkOutVerificationMethod: AttendanceVerificationMethod;
  checkOutVerificationLevel: AttendanceVerificationLevel;
  checkOutVerificationReason: string | null;
  gpsValidated?: boolean | null;
  distanceFromOffice?: number | null;
  securityFlags?: string[] | null;
  createdAt?: string;
  updatedAt?: string;
  employee: AuthenticatedUser;
};

export type AttendanceHistoryPage = {
  items: AttendanceRecord[];
  organizationTimezone: string | null;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  period: { startDate: string; endDate: string };
};

export type EmployeeTodayAttendance = {
  date: string;
  organizationTimezone: string | null;
  expectedToday: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  monthlyAbsenceCount: number;
  securityPolicy?: AttendanceSecurityPolicy;
  attendance: AttendanceRecord | null;
  employee: AuthenticatedEmployee;
};

export type SanctionStatus = 'TOLERATED' | 'APPLIED' | 'NOT_APPLICABLE';
export type SanctionRuleType =
  | 'MINOR_LATENESS'
  | 'MAJOR_LATENESS'
  | 'EARLY_DEPARTURE'
  | 'UNJUSTIFIED_ABSENCE'
  | 'JUSTIFIED_ABSENCE'
  | 'LEAVE'
  | 'EXTERNAL_MISSION';
export type CreatableSanctionRuleType = 'MINOR_LATENESS' | 'MAJOR_LATENESS';

export type SanctionResult = {
  employeeId: string;
  employeeIdentifier?: string | null;
  employeeName?: string | null;
  department?: string | null;
  attendanceId: string;
  date: string;
  ruleType: SanctionRuleType | null;
  reason: string;
  amount: number;
  status: SanctionStatus;
};

export type SanctionRuleConfig = {
  id?: string;
  code?: string | null;
  type: SanctionRuleType;
  name?: string;
  description?: string | null;
  active: boolean;
  conditions: Array<{
    field: string;
    operator: string;
    value: number;
  }>;
  latenessMinMinutes?: number | null;
  latenessMinInclusive?: boolean;
  latenessMaxMinutes?: number | null;
  latenessMaxInclusive?: boolean;
  monthlyTolerance: number;
  amount: number;
  reason: string;
  toleratedReason?: string | null;
  priority?: number;
};

export type CreateSanctionRulePayload = {
  type: CreatableSanctionRuleType;
  code: string;
  name: string;
  description?: string | null;
  active?: boolean;
  latenessMinMinutes?: number | null;
  latenessMinInclusive?: boolean;
  latenessMaxMinutes?: number | null;
  latenessMaxInclusive?: boolean;
  monthlyTolerance: number;
  amountFcfa: number;
  priority: number;
  appliedReason: string;
  toleratedReason?: string | null;
};

export type UpdateSanctionRulePayload = {
  active?: boolean;
  name?: string;
  description?: string | null;
  latenessMinMinutes?: number | null;
  latenessMaxMinutes?: number | null;
  monthlyTolerance?: number;
  amountFcfa?: number;
  priority?: number;
};

export type CalendarDayType =
  | 'WORKING_DAY'
  | 'PUBLIC_HOLIDAY'
  | 'COMPANY_HOLIDAY'
  | 'WEEKEND'
  | 'LEAVE'
  | 'EXTERNAL_MISSION';

export type CalendarEntryType =
  | 'PUBLIC_HOLIDAY'
  | 'COMPANY_HOLIDAY'
  | 'LEAVE'
  | 'EXTERNAL_MISSION';

export type CalendarEntryRecord = {
  id: string;
  name: string;
  description: string | null;
  date: string;
  type: CalendarEntryType;
  employeeId: string | null;
  employeeIdentifier: string | null;
  employeeName: string | null;
  department: string | null;
  isActive: boolean;
  siteId: string | null;
  scope: 'ORGANIZATION' | 'SITE';
  inherited: boolean;
};

export type CalendarDayRecord = {
  date: string;
  dayLabel: string;
  isoWeekLabel: string;
  type: CalendarDayType;
  label: string;
  description: string | null;
  isNonWorkingDay: boolean;
  entries: CalendarEntryRecord[];
};

export type CalendarMonthResponse = {
  month: string;
  monthLabel: string;
  summary: {
    workingDays: number;
    weekends: number;
    publicHolidays: number;
    companyHolidays: number;
  };
  days: CalendarDayRecord[];
  entries: CalendarEntryRecord[];
};

export type CreateCalendarEntryPayload = {
  name: string;
  date: string;
  description?: string | null;
  type: Extract<CalendarEntryType, 'PUBLIC_HOLIDAY' | 'COMPANY_HOLIDAY'>;
};

export type UpdateCalendarEntryPayload = Partial<CreateCalendarEntryPayload>;

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

function isInternalDockerBackendUrl(value: string) {
  return value === 'http://backend:4000/api/v1';
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
    const configuredValue = process.env.API_BASE_URL.trim();

    if (isInternalDockerBackendUrl(configuredValue)) {
      return configuredValue;
    }

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

export async function getAttendanceSites(token: string) {
  return requestApi<AttendanceSite[]>('/attendance-sites', { token });
}

export async function getSiteDetails(token: string, siteId: string) {
  return requestApi<AttendanceSite>(
    `/attendance-sites/${encodeURIComponent(siteId)}`,
    { token },
  );
}

export async function getSiteAttendanceSettings(token: string, siteId: string) {
  return requestApi<SiteAttendanceSettings>(
    `/attendance-sites/${encodeURIComponent(siteId)}/settings`,
    { token },
  );
}

export async function getSiteDashboard(token: string, siteId: string) {
  return requestApi<SiteDashboardOverview>(
    `/attendance-sites/${encodeURIComponent(siteId)}/dashboard`,
    { token },
  );
}

export async function getSiteEmployees(
  token: string,
  siteId: string,
  params: URLSearchParams = new URLSearchParams(),
) {
  return requestApi<SitePage<SiteEmployeeRecord>>(
    `/attendance-sites/${encodeURIComponent(siteId)}/employees?${params}`,
    { token },
  );
}

export async function getSiteSchedules(
  token: string,
  siteId: string,
  params: URLSearchParams = new URLSearchParams(),
) {
  return requestApi<SitePage<SiteScheduleRecord>>(
    `/attendance-sites/${encodeURIComponent(siteId)}/schedules?${params}`,
    { token },
  );
}

export async function getSiteAttendance(
  token: string,
  siteId: string,
  params: URLSearchParams = new URLSearchParams(),
) {
  return requestApi<AttendanceHistoryPage>(
    `/attendance-sites/${encodeURIComponent(siteId)}/attendance?${params}`,
    { token },
  );
}

export async function getSiteHistory(
  token: string,
  siteId: string,
  params: URLSearchParams = new URLSearchParams(),
) {
  return requestApi<AttendanceHistoryPage>(
    `/attendance-sites/${encodeURIComponent(siteId)}/history?${params}`,
    { token },
  );
}

export async function getSiteAttendanceReport(
  token: string,
  siteId: string,
  params: URLSearchParams,
) {
  return requestApi<SiteAttendanceReport>(
    `/attendance-sites/${encodeURIComponent(siteId)}/reports?${params}`,
    { token },
  );
}

export async function getCurrentUserFromApi(token: string) {
  return requestApi<AuthenticatedUser>('/auth/me', { token });
}

export async function getEmployeeAttendanceData(token: string, month?: string) {
  const today = await requestApi<EmployeeTodayAttendance>(
    '/attendance/me/today',
    { token },
  );
  const resolvedMonth = month ?? today.date.slice(0, 7);
  const history = await requestApi<AttendanceRecord[]>(
    `/attendance/me/history?month=${encodeURIComponent(resolvedMonth)}`,
    { token },
  );

  return {
    today,
    history,
  };
}

export async function getAttendanceHistoryData(token: string, month?: string) {
  const pageSize = 50;
  const params = new URLSearchParams({
    page: '1',
    pageSize: String(pageSize),
  });
  if (month) params.set('month', month);

  const firstPage = await requestApi<AttendanceHistoryPage>(
    `/attendance/history?${params.toString()}`,
    { token },
  );
  if (firstPage.totalPages <= 1) return firstPage;

  const items = [...firstPage.items];
  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    const nextParams = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    if (month) nextParams.set('month', month);

    const nextPage = await requestApi<AttendanceHistoryPage>(
      `/attendance/history?${nextParams.toString()}`,
      { token },
    );
    items.push(...nextPage.items);
  }

  return {
    ...firstPage,
    items,
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

export async function getTeamData(token: string) {
  const [employeeData, members, invitations] = await Promise.all([
    getEmployeesData(token),
    requestApi<OrganizationMember[]>('/organizations/current/members', {
      token,
    }),
    requestApi<OrganizationInvitation[]>('/organizations/current/invitations', {
      token,
    }),
  ]);

  return { ...employeeData, members, invitations };
}

export async function getSchedulesData(token: string) {
  return requestApi<ScheduleRecord[]>('/schedules', { token });
}

export async function getOrganizationAttendanceSettings(token: string) {
  return requestApi<OrganizationAttendanceSettings>(
    '/organizations/current/attendance-settings',
    { token },
  );
}

export async function getCurrentOrganizationProfile(token: string) {
  return requestApi<OrganizationProfile>('/organizations/current', { token });
}

export async function getOwnerOnboardingStatus(token: string) {
  return requestApi<OwnerOnboardingStatus>(
    '/organizations/current/owner-onboarding',
    { token },
  );
}

export async function getOrganizationSubscription(token: string) {
  return requestApi<OrganizationSubscription>(
    '/organizations/current/subscription',
    { token },
  );
}

export type PlatformOrganization = OrganizationSubscription & {
  organization: {
    id: string;
    name: string;
    slug: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
    createdAt: string;
  };
};

export type PlatformDashboard = {
  statistics: {
    totalOrganizations: number;
    byStatus: Record<SubscriptionStatus, number>;
    byPlan: Record<SubscriptionPlan, number>;
    usage: {
      activeEmployees: number;
      activeAttendanceSites: number;
    };
  };
  organizations: PlatformOrganization[];
};

export type PlanEntitlements = OrganizationSubscription['entitlements'];
export type PlatformPlanEntitlements = Record<SubscriptionPlan, PlanEntitlements>;

export async function getPlatformPlanEntitlements(token: string) {
  return requestApi<PlatformPlanEntitlements>('/platform/plan-entitlements', {
    token,
  });
}

export async function getPlatformOrganizations(token: string) {
  return requestApi<PlatformOrganization[]>('/platform/organizations', {
    token,
  });
}

export async function getPlatformDashboard(token: string) {
  return requestApi<PlatformDashboard>('/platform/dashboard', { token });
}

export async function getMonthlySanctionsData(token: string, month: string) {
  return requestApi<SanctionResult[]>(
    `/sanctions/monthly?month=${encodeURIComponent(month)}`,
    { token },
  );
}

export async function getSiteMonthlySanctionsData(
  token: string,
  siteId: string,
  month: string,
) {
  return requestApi<SanctionResult[]>(
    `/attendance-sites/${encodeURIComponent(siteId)}/sanctions?month=${encodeURIComponent(month)}`,
    { token },
  );
}

export async function getSanctionRulesData(token: string) {
  return requestApi<SanctionRuleConfig[]>('/sanctions/rules', { token });
}

export async function createSanctionRule(payload: CreateSanctionRulePayload) {
  const response = await fetch('/api/sanctions/rules', {
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new ApiRequestError(
      await parseErrorMessage(response),
      response.status,
    );
  }

  return (await response.json()) as SanctionRuleConfig;
}

export async function getCalendarMonthData(token: string, month: string) {
  return requestApi<CalendarMonthResponse>(
    `/calendar/month?month=${encodeURIComponent(month)}`,
    { token },
  );
}

export async function getSiteCalendarMonthData(token: string, siteId: string, month: string) {
  return requestApi<CalendarMonthResponse & { site: { id: string; name: string; isActive: boolean } }>(
    `/attendance-sites/${encodeURIComponent(siteId)}/calendar?month=${encodeURIComponent(month)}`,
    { token },
  );
}
