import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import * as Joi from 'joi';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { parse as parseDotenv } from 'dotenv';
import { AuditLogModule } from './common/audit/audit-log.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { AppThrottlerGuard } from './common/security/app-throttler.guard';
import { ProductionExceptionFilter } from './common/errors/production-exception.filter';
import { RateLimitStorageModule } from './common/security/rate-limit-storage.module';
import { RateLimitStorageService } from './common/security/rate-limit-storage.service';
import { getClientIp } from './common/security/client-ip';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AuthModule } from './modules/auth/auth.module';
import {
  ATTENDANCE_ENTRY_LOGIN_PATH,
  ATTENDANCE_ENTRY_PIN_LONG_THROTTLER_NAME,
  ATTENDANCE_ENTRY_PIN_SHORT_THROTTLER_NAME,
} from './modules/auth/constants/attendance-entry.constants';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { HealthModule } from './modules/health/health.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { SanctionsModule } from './modules/sanctions/sanctions.module';
import { SchedulesModule } from './modules/schedules/schedules.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { AttendanceSitesModule } from './modules/attendance-sites/attendance-sites.module';
import { SiteDataModule } from './modules/site-data/site-data.module';
import { OrganizationTimezoneModule } from './common/time/organization-timezone.module';

const nodeEnv = process.env.NODE_ENV;
const backendRootDir = resolve(__dirname, '..');

function applyLocalEnvironmentOverrides() {
  if (nodeEnv === 'production' || nodeEnv === 'test') {
    return;
  }

  const localEnvPath = resolve(backendRootDir, '.env.local');

  if (!existsSync(localEnvPath)) {
    return;
  }

  const localEnvironment = parseDotenv(readFileSync(localEnvPath, 'utf8'));
  const localOverrideKeys = [
    'NODE_ENV',
    'PORT',
    'FRONTEND_URL',
    'DATABASE_URL',
  ] as const;

  for (const key of localOverrideKeys) {
    const value = localEnvironment[key];

    if (value) {
      process.env[key] = value;
    }
  }
}

applyLocalEnvironmentOverrides();

export function buildEnvFilePaths(
  currentNodeEnv = nodeEnv,
  currentDir = backendRootDir,
) {
  const environmentSpecificPaths = [
    currentNodeEnv ? resolve(currentDir, `.env.${currentNodeEnv}.local`) : null,
    currentNodeEnv ? resolve(currentDir, `.env.${currentNodeEnv}`) : null,
  ].filter((value): value is string => Boolean(value));

  if (currentNodeEnv === 'production') {
    return environmentSpecificPaths;
  }

  return [
    ...environmentSpecificPaths,
    resolve(currentDir, '.env.local'),
    resolve(currentDir, '.env'),
  ].filter((value): value is string => Boolean(value));
}

const envFilePath = buildEnvFilePaths();
const optionalTrimmedString = Joi.string().trim().empty('').optional();

function isLocalhostUrl(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }

  try {
    const hostname = new URL(value).hostname;

    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0'
    );
  } catch {
    return false;
  }
}

function isHttpsUrl(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }

  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function parseUrl(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) return null;

  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function hasUrlPassword(value: unknown) {
  const parsed = parseUrl(value);
  return Boolean(parsed?.password);
}

function hasSecurePostgresTransport(value: unknown) {
  const parsed = parseUrl(value);
  const sslMode = parsed?.searchParams.get('sslmode')?.toLowerCase();

  return (
    sslMode === 'require' ||
    sslMode === 'verify-ca' ||
    sslMode === 'verify-full'
  );
}

function isTlsRedisUrl(value: unknown) {
  return parseUrl(value)?.protocol === 'rediss:';
}

function isExactOrigin(value: unknown) {
  const parsed = parseUrl(value);
  return Boolean(
    parsed &&
    (parsed.pathname === '' || parsed.pathname === '/') &&
    !parsed.search &&
    !parsed.hash &&
    !parsed.username &&
    !parsed.password,
  );
}

function durationInSeconds(value: unknown) {
  if (typeof value !== 'string') return null;
  if (/^\d+$/.test(value)) return Number(value);
  const match = value.match(/^(\d+)([smhd])$/);
  if (!match) return null;
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 } as const;
  return Number(match[1]) * multipliers[match[2] as keyof typeof multipliers];
}

function isTunnelUrl(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }

  try {
    const hostname = new URL(value).hostname.toLowerCase();

    return [
      '.trycloudflare.com',
      '.ngrok-free.app',
      '.ngrok.io',
      '.loca.lt',
    ].some((suffix) => hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

function isPrivateIpHostname(hostname: string) {
  return (
    /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
    /^192\.168\.\d+\.\d+$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(hostname)
  );
}

function isPrivateNetworkUrl(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }

  try {
    return isPrivateIpHostname(new URL(value).hostname);
  } catch {
    return false;
  }
}

export function validateSecurityConfig(
  value: Record<string, unknown>,
  _helpers?: Joi.CustomHelpers,
) {
  const securityEnabled =
    value.ATTENDANCE_SECURITY_ENABLED === true ||
    value.ATTENDANCE_SECURITY_ENABLED === 'true';
  const gpsRequired =
    value.ATTENDANCE_GPS_REQUIRED === undefined
      ? securityEnabled
      : value.ATTENDANCE_GPS_REQUIRED === true ||
        value.ATTENDANCE_GPS_REQUIRED === 'true';
  const hasLatitude =
    value.COMPANY_LATITUDE !== undefined && value.COMPANY_LATITUDE !== null;
  const hasLongitude =
    value.COMPANY_LONGITUDE !== undefined && value.COMPANY_LONGITUDE !== null;

  if (gpsRequired && (!hasLatitude || !hasLongitude)) {
    throw new Error(
      'COMPANY_LATITUDE and COMPANY_LONGITUDE are required when attendance GPS enforcement is enabled.',
    );
  }

  if (hasLatitude !== hasLongitude) {
    throw new Error(
      'COMPANY_LATITUDE and COMPANY_LONGITUDE must be configured together.',
    );
  }

  const trustedRadius = Number(value.ATTENDANCE_TRUSTED_RADIUS_METERS ?? 100);
  const warningRadius =
    value.ATTENDANCE_WARNING_RADIUS_METERS ??
    value.ATTENDANCE_ALLOWED_RADIUS_METERS;

  if (
    warningRadius !== undefined &&
    Number(warningRadius) < Number(trustedRadius)
  ) {
    throw new Error(
      'ATTENDANCE_WARNING_RADIUS_METERS must be greater than or equal to ATTENDANCE_TRUSTED_RADIUS_METERS.',
    );
  }

  const cloudinaryKeys = [
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
  ];
  const configuredCloudinaryKeys = cloudinaryKeys.filter((key) => {
    const candidate = value[key];

    return typeof candidate === 'string' && candidate.trim().length > 0;
  });

  if (
    configuredCloudinaryKeys.length > 0 &&
    configuredCloudinaryKeys.length !== cloudinaryKeys.length
  ) {
    throw new Error(
      'Cloudinary photo storage requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET together.',
    );
  }

  if (
    value.NODE_ENV === 'production' &&
    typeof value.JWT_SECRET === 'string' &&
    /change[-_ ]?this|replace[-_ ]?(this|with)|placeholder|example|local|test|secret/i.test(
      value.JWT_SECRET,
    )
  ) {
    throw new Error('JWT_SECRET must be replaced with a production secret.');
  }

  const jwtLifetime = durationInSeconds(value.JWT_EXPIRES_IN ?? '1d');
  const attendanceLifetime = durationInSeconds(
    value.ATTENDANCE_ENTRY_JWT_EXPIRES_IN ?? '15m',
  );
  const selectionLifetime = durationInSeconds(
    value.ORGANIZATION_SELECTION_JWT_EXPIRES_IN ?? '5m',
  );
  if (
    value.NODE_ENV === 'production' &&
    (jwtLifetime === null || jwtLifetime > 86_400)
  ) {
    throw new Error(
      'JWT_EXPIRES_IN must be valid and no longer than 1d in production.',
    );
  }
  if (
    value.NODE_ENV === 'production' &&
    (attendanceLifetime === null || attendanceLifetime > 1_800)
  ) {
    throw new Error(
      'ATTENDANCE_ENTRY_JWT_EXPIRES_IN must be valid and no longer than 30m in production.',
    );
  }
  if (
    value.NODE_ENV === 'production' &&
    (selectionLifetime === null || selectionLifetime > 900)
  ) {
    throw new Error(
      'ORGANIZATION_SELECTION_JWT_EXPIRES_IN must be valid and no longer than 15m in production.',
    );
  }

  if (value.NODE_ENV === 'production' && isLocalhostUrl(value.FRONTEND_URL)) {
    throw new Error('FRONTEND_URL cannot point to localhost in production.');
  }

  if (value.NODE_ENV === 'production' && !isHttpsUrl(value.FRONTEND_URL)) {
    throw new Error('FRONTEND_URL must use HTTPS in production.');
  }

  if (value.NODE_ENV === 'production' && isTunnelUrl(value.FRONTEND_URL)) {
    throw new Error(
      'FRONTEND_URL cannot use a temporary tunnel hostname in production.',
    );
  }

  if (
    value.NODE_ENV === 'production' &&
    isPrivateNetworkUrl(value.FRONTEND_URL)
  ) {
    throw new Error(
      'FRONTEND_URL cannot point to a private network IP in production.',
    );
  }

  if (value.NODE_ENV === 'production' && !isExactOrigin(value.FRONTEND_URL)) {
    throw new Error(
      'FRONTEND_URL must be an exact origin without credentials, path, query, or fragment in production.',
    );
  }

  if (
    value.NODE_ENV === 'production' &&
    !hasSecurePostgresTransport(value.DATABASE_URL)
  ) {
    throw new Error(
      'DATABASE_URL must require TLS in production (sslmode=require or stricter).',
    );
  }

  if (
    value.NODE_ENV === 'production' &&
    (typeof value.RATE_LIMIT_REDIS_URL !== 'string' ||
      value.RATE_LIMIT_REDIS_URL.trim().length === 0)
  ) {
    throw new Error(
      'RATE_LIMIT_REDIS_URL is required in production for distributed rate limiting.',
    );
  }

  if (
    value.NODE_ENV === 'production' &&
    !isTlsRedisUrl(value.RATE_LIMIT_REDIS_URL)
  ) {
    throw new Error(
      'RATE_LIMIT_REDIS_URL must use rediss:// TLS in production.',
    );
  }

  if (
    value.NODE_ENV === 'production' &&
    !hasUrlPassword(value.RATE_LIMIT_REDIS_URL)
  ) {
    throw new Error(
      'RATE_LIMIT_REDIS_URL must include Redis credentials in production.',
    );
  }

  if (
    value.NODE_ENV === 'production' &&
    (typeof value.TRUST_PROXY_CIDRS !== 'string' ||
      value.TRUST_PROXY_CIDRS.trim().length === 0)
  ) {
    throw new Error(
      'TRUST_PROXY_CIDRS is required in production to prevent forged proxy headers.',
    );
  }

  return value;
}

function getRequestPath(request: { url?: string }) {
  return request.url?.split('?')[0] ?? '';
}

function hashRateLimitSubject(value: unknown) {
  const normalized =
    typeof value === 'string' ? value.trim().toLowerCase() : '<missing>';

  return createHash('sha256').update(normalized).digest('hex');
}

function isInvitationAdminPath(path: string) {
  return path.includes('/organizations/current/invitations');
}

function isSensitiveAdminMutation(method: string | undefined, path: string) {
  if (method !== 'POST' && method !== 'PATCH') {
    return false;
  }

  return [
    '/organizations/current',
    '/organizations/current/members',
    '/employees',
    '/schedules',
    '/calendar',
    '/sanctions',
  ].some((prefix) => path.includes(prefix));
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'test', 'production')
          .default('development'),
        PORT: Joi.number().default(4000),
        FRONTEND_URL: Joi.string().uri().required(),
        JWT_SECRET: Joi.string().min(32).required(),
        JWT_EXPIRES_IN: Joi.string().default('1d'),
        ATTENDANCE_ENTRY_JWT_EXPIRES_IN: Joi.string().default('15m'),
        ORGANIZATION_SELECTION_JWT_EXPIRES_IN: Joi.string().default('5m'),
        DATABASE_URL: Joi.string().uri().required(),
        JSON_BODY_LIMIT: Joi.string()
          .trim()
          .pattern(/^\d+(b|kb|mb)$/i)
          .default('10mb'),
        RATE_LIMIT_TTL_MS: Joi.number().integer().positive().default(60000),
        RATE_LIMIT_MAX: Joi.number().integer().positive().default(300),
        LOGIN_RATE_LIMIT_TTL_MS: Joi.number()
          .integer()
          .positive()
          .default(60000),
        LOGIN_RATE_LIMIT_MAX: Joi.number().integer().positive().default(20),
        TRUST_PROXY_HOPS: Joi.number().integer().min(0).default(0),
        TRUST_PROXY_CIDRS: optionalTrimmedString,
        RATE_LIMIT_REDIS_URL: Joi.string()
          .trim()
          .uri({ scheme: ['redis', 'rediss'] })
          .empty('')
          .optional(),
        RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS: Joi.number()
          .integer()
          .positive()
          .default(5000),
        RATE_LIMIT_REDIS_COMMAND_TIMEOUT_MS: Joi.number()
          .integer()
          .positive()
          .default(2000),
        ATTENDANCE_SECURITY_ENABLED: Joi.boolean().default(false),
        ATTENDANCE_SELFIE_REQUIRED: Joi.boolean().optional(),
        ATTENDANCE_GPS_REQUIRED: Joi.boolean().optional(),
        COMPANY_LATITUDE: Joi.number().min(-90).max(90).optional(),
        COMPANY_LONGITUDE: Joi.number().min(-180).max(180).optional(),
        ATTENDANCE_TRUSTED_RADIUS_METERS: Joi.number().positive().optional(),
        ATTENDANCE_WARNING_RADIUS_METERS: Joi.number().positive().optional(),
        ATTENDANCE_ALLOWED_RADIUS_METERS: Joi.number().positive().optional(),
        ATTENDANCE_MAX_ACCURACY_METERS: Joi.number().positive().optional(),
        CLOUDINARY_CLOUD_NAME: optionalTrimmedString,
        CLOUDINARY_API_KEY: optionalTrimmedString,
        CLOUDINARY_API_SECRET: optionalTrimmedString,
        ATTENDANCE_PDF_RENDERER: Joi.string()
          .valid('premium', 'puppeteer', 'legacy')
          .default('premium'),
        ATTENDANCE_PDF_EXECUTABLE_PATH: optionalTrimmedString,
        ATTENDANCE_PDF_ALLOW_LEGACY_FALLBACK: Joi.boolean().default(false),
        CLOUDINARY_ATTENDANCE_FOLDER: Joi.string()
          .trim()
          .empty('')
          .default('konatech/attendance-verifications'),
        CLOUDINARY_UPLOAD_TIMEOUT_MS: Joi.number()
          .integer()
          .positive()
          .default(10000),
        CLOUDINARY_UPLOAD_MAX_RETRIES: Joi.number().integer().min(0).default(2),
        CLOUDINARY_UPLOAD_RETRY_DELAY_MS: Joi.number()
          .integer()
          .positive()
          .default(300),
      }).custom(validateSecurityConfig),
    }),
    RateLimitStorageModule,
    ThrottlerModule.forRootAsync({
      imports: [RateLimitStorageModule],
      inject: [ConfigService, RateLimitStorageService],
      useFactory: (
        configService: ConfigService,
        storage: RateLimitStorageService,
      ) => ({
        storage,
        throttlers: [
          {
            ttl: configService.getOrThrow<number>('RATE_LIMIT_TTL_MS'),
            limit: configService.getOrThrow<number>('RATE_LIMIT_MAX'),
          },
          {
            name: 'login',
            ttl: configService.getOrThrow<number>('LOGIN_RATE_LIMIT_TTL_MS'),
            limit: configService.getOrThrow<number>('LOGIN_RATE_LIMIT_MAX'),
            skipIf: (context) => {
              const request = context.switchToHttp().getRequest<{
                method?: string;
                url?: string;
              }>();
              const path = getRequestPath(request);

              return request.method !== 'POST' || !path.endsWith('/auth/login');
            },
          },
          {
            name: ATTENDANCE_ENTRY_PIN_SHORT_THROTTLER_NAME,
            ttl: 60_000,
            limit: 30,
            skipIf: (context) => {
              const request = context.switchToHttp().getRequest<{
                method?: string;
                url?: string;
              }>();
              const path = getRequestPath(request);

              return (
                request.method !== 'POST' ||
                !path.endsWith(ATTENDANCE_ENTRY_LOGIN_PATH)
              );
            },
          },
          {
            name: ATTENDANCE_ENTRY_PIN_LONG_THROTTLER_NAME,
            ttl: 600_000,
            limit: 100,
            skipIf: (context) => {
              const request = context.switchToHttp().getRequest<{
                method?: string;
                url?: string;
              }>();
              const path = getRequestPath(request);

              return (
                request.method !== 'POST' ||
                !path.endsWith(ATTENDANCE_ENTRY_LOGIN_PATH)
              );
            },
          },
          {
            name: 'invitationAcceptToken',
            ttl: 60_000,
            limit: 5,
            getTracker: (request) =>
              `${getClientIp(request)}:${hashRateLimitSubject(
                (request.body as { token?: unknown } | undefined)?.token,
              )}`,
            skipIf: (context) => {
              const request = context.switchToHttp().getRequest<{
                method?: string;
                url?: string;
              }>();

              return (
                request.method !== 'POST' ||
                !getRequestPath(request).endsWith('/invitations/accept')
              );
            },
          },
          {
            name: 'invitationAcceptIp',
            ttl: 60_000,
            limit: 20,
            skipIf: (context) => {
              const request = context.switchToHttp().getRequest<{
                method?: string;
                url?: string;
              }>();

              return (
                request.method !== 'POST' ||
                !getRequestPath(request).endsWith('/invitations/accept')
              );
            },
          },
          {
            name: 'invitationAdmin',
            ttl: 60_000,
            limit: 30,
            skipIf: (context) => {
              const request = context.switchToHttp().getRequest<{
                url?: string;
              }>();

              return !isInvitationAdminPath(getRequestPath(request));
            },
          },
          {
            name: 'sensitiveAdminMutation',
            ttl: 60_000,
            limit: 60,
            skipIf: (context) => {
              const request = context.switchToHttp().getRequest<{
                method?: string;
                url?: string;
              }>();

              return !isSensitiveAdminMutation(
                request.method,
                getRequestPath(request),
              );
            },
          },
        ],
      }),
    }),
    AuditLogModule,
    PrismaModule,
    AuthModule,
    HealthModule,
    DashboardModule,
    EmployeesModule,
    CalendarModule,
    AttendanceModule,
    SanctionsModule,
    SchedulesModule,
    OrganizationsModule,
    MembershipsModule,
    InvitationsModule,
    SubscriptionsModule,
    AttendanceSitesModule,
    SiteDataModule,
    OrganizationTimezoneModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ProductionExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
  ],
})
export class AppModule {}
