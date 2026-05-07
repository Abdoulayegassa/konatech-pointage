import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import * as Joi from 'joi';
import { resolve } from 'node:path';
import { AuditLogModule } from './common/audit/audit-log.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { AppThrottlerGuard } from './common/security/app-throttler.guard';
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
import { SchedulesModule } from './modules/schedules/schedules.module';

const nodeEnv = process.env.NODE_ENV;
const backendRootDir = resolve(__dirname, '..');

export function buildEnvFilePaths(
  currentNodeEnv = nodeEnv,
  currentDir = backendRootDir,
) {
  return [
    currentNodeEnv ? resolve(currentDir, `.env.${currentNodeEnv}.local`) : null,
    currentNodeEnv ? resolve(currentDir, `.env.${currentNodeEnv}`) : null,
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
  const hasLatitude =
    value.COMPANY_LATITUDE !== undefined && value.COMPANY_LATITUDE !== null;
  const hasLongitude =
    value.COMPANY_LONGITUDE !== undefined && value.COMPANY_LONGITUDE !== null;

  if (securityEnabled && (!hasLatitude || !hasLongitude)) {
    throw new Error(
      'COMPANY_LATITUDE and COMPANY_LONGITUDE are required when ATTENDANCE_SECURITY_ENABLED is true.',
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
    /change-this|local|test/i.test(value.JWT_SECRET)
  ) {
    throw new Error('JWT_SECRET must be replaced with a production secret.');
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

  return value;
}

function getRequestPath(request: { url?: string }) {
  return request.url?.split('?')[0] ?? '';
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
        ATTENDANCE_SECURITY_ENABLED: Joi.boolean().default(false),
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
          .valid('puppeteer', 'legacy')
          .default('puppeteer'),
        ATTENDANCE_PDF_EXECUTABLE_PATH: optionalTrimmedString,
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
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
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
          limit: 5,
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
          limit: 10,
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
      ],
    }),
    AuditLogModule,
    PrismaModule,
    AuthModule,
    HealthModule,
    DashboardModule,
    EmployeesModule,
    AttendanceModule,
    SchedulesModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
  ],
})
export class AppModule {}
