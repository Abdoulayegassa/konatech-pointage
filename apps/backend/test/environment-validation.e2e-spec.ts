import {
  GatewayTimeoutException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { resolve } from 'node:path';

import {
  AppModule,
  buildEnvFilePaths,
  validateSecurityConfig,
} from '../src/app.module';
import { AttendancePhotoStorageService } from '../src/modules/attendance/attendance-photo-storage.service';

describe('environment validation', () => {
  const envKeys = [
    'NODE_ENV',
    'ATTENDANCE_SECURITY_ENABLED',
    'COMPANY_LATITUDE',
    'COMPANY_LONGITUDE',
    'ATTENDANCE_TRUSTED_RADIUS_METERS',
    'ATTENDANCE_WARNING_RADIUS_METERS',
    'JSON_BODY_LIMIT',
    'RATE_LIMIT_TTL_MS',
    'RATE_LIMIT_MAX',
    'LOGIN_RATE_LIMIT_TTL_MS',
    'LOGIN_RATE_LIMIT_MAX',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'CLOUDINARY_UPLOAD_TIMEOUT_MS',
    'CLOUDINARY_UPLOAD_MAX_RETRIES',
    'CLOUDINARY_UPLOAD_RETRY_DELAY_MS',
  ];

  let previousValues: Record<string, string | undefined>;

  beforeEach(() => {
    previousValues = Object.fromEntries(
      envKeys.map((key) => [key, process.env[key]]),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();

    for (const key of envKeys) {
      const previousValue = previousValues[key];

      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  });

  it('rejects incoherent smart security radius configuration', async () => {
    expect(() =>
      validateSecurityConfig(
        {
          ATTENDANCE_SECURITY_ENABLED: true,
          COMPANY_LATITUDE: 5.359952,
          COMPANY_LONGITUDE: -4.008256,
          ATTENDANCE_TRUSTED_RADIUS_METERS: 300,
          ATTENDANCE_WARNING_RADIUS_METERS: 100,
        },
        {} as never,
      ),
    ).toThrow(/ATTENDANCE_WARNING_RADIUS_METERS/);
  });

  it('resolves backend env files from the backend root instead of the process cwd', () => {
    expect(buildEnvFilePaths('development', 'C:/repo/apps/backend')).toEqual([
      resolve('C:/repo/apps/backend', '.env.development.local'),
      resolve('C:/repo/apps/backend', '.env.development'),
      resolve('C:/repo/apps/backend', '.env.local'),
      resolve('C:/repo/apps/backend', '.env'),
    ]);
  });

  it('does not fall back to generic development env files in production', () => {
    expect(buildEnvFilePaths('production', '/srv/backend')).toEqual([
      resolve('/srv/backend', '.env.production.local'),
      resolve('/srv/backend', '.env.production'),
    ]);
  });

  describe('production fail-closed configuration', () => {
    const productionConfig = {
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://pointage.example.com',
      JWT_SECRET: 'vR9!Km2#Qx7@Wp4$Bn8&Hs5*Ld3%Tf6Z',
      JWT_EXPIRES_IN: '1d',
      ATTENDANCE_ENTRY_JWT_EXPIRES_IN: '15m',
      ORGANIZATION_SELECTION_JWT_EXPIRES_IN: '5m',
      DATABASE_URL:
        'postgresql://app:password@db.example.com/attendance?sslmode=require',
      RATE_LIMIT_REDIS_URL:
        'rediss://default:password@redis.example.com:6379/0',
      TRUST_PROXY_CIDRS: '172.16.0.0/12',
    };

    it.each([
      [
        'placeholder JWT secrets',
        { JWT_SECRET: 'replace-with-a-long-random-jwt-secret' },
        /JWT_SECRET/,
      ],
      [
        'non-TLS database connections',
        { DATABASE_URL: 'postgresql://app:password@db.example.com/attendance' },
        /DATABASE_URL must require TLS/,
      ],
      [
        'non-TLS Redis connections',
        {
          RATE_LIMIT_REDIS_URL:
            'redis://default:password@redis.example.com:6379/0',
        },
        /must use rediss/,
      ],
      [
        'unauthenticated Redis connections',
        { RATE_LIMIT_REDIS_URL: 'rediss://redis.example.com:6379/0' },
        /must include Redis credentials/,
      ],
      [
        'frontend URLs with paths',
        { FRONTEND_URL: 'https://pointage.example.com/app' },
        /exact origin/,
      ],
      [
        'overlong account sessions',
        { JWT_EXPIRES_IN: '7d' },
        /no longer than 1d/,
      ],
      [
        'overlong attendance-entry sessions',
        { ATTENDANCE_ENTRY_JWT_EXPIRES_IN: '2h' },
        /no longer than 30m/,
      ],
      [
        'overlong organization-selection sessions',
        { ORGANIZATION_SELECTION_JWT_EXPIRES_IN: '1h' },
        /no longer than 15m/,
      ],
    ])('rejects %s', (_label, override, expected) => {
      expect(() =>
        validateSecurityConfig({ ...productionConfig, ...override }),
      ).toThrow(expected);
    });

    it('accepts a complete secure production configuration', () => {
      expect(() => validateSecurityConfig(productionConfig)).not.toThrow();
    });
  });

  it('allows smart security to boot without Cloudinary credentials', async () => {
    process.env.ATTENDANCE_SECURITY_ENABLED = 'true';
    process.env.COMPANY_LATITUDE = '5.359952';
    process.env.COMPANY_LONGITUDE = '-4.008256';
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    await moduleFixture.close();
  });

  it('requires Cloudinary credentials only when photo storage is used', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;

    const service = new AttendancePhotoStorageService(new ConfigService());
    const photoDataUrl = `data:image/jpeg;base64,${Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from('verification-photo'),
    ]).toString('base64')}`;

    await expect(
      service.uploadVerificationPhoto(photoDataUrl, {
        employeeId: 'employee-1',
        occurredAt: new Date('2026-04-20T08:00:00.000Z'),
        reason: 'OUTSIDE_ALLOWED_RADIUS',
      }),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('retries transient Cloudinary upload failures', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CLOUDINARY_CLOUD_NAME = 'konatech-test';
    process.env.CLOUDINARY_API_KEY = 'cloudinary-key';
    process.env.CLOUDINARY_API_SECRET = 'cloudinary-secret';
    process.env.CLOUDINARY_UPLOAD_TIMEOUT_MS = '1000';
    process.env.CLOUDINARY_UPLOAD_MAX_RETRIES = '1';
    process.env.CLOUDINARY_UPLOAD_RETRY_DELAY_MS = '1';

    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: 'Temporary Cloudinary outage.',
            },
          }),
          {
            status: 500,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            public_id: '2026-04-20/employee-1/outside_allowed_radius',
            secure_url:
              'https://res.cloudinary.com/konatech-test/image/upload/photo.jpg',
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      );

    const service = new AttendancePhotoStorageService(new ConfigService());
    const photoDataUrl = `data:image/jpeg;base64,${Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from('verification-photo'),
    ]).toString('base64')}`;

    await expect(
      service.uploadVerificationPhoto(photoDataUrl, {
        employeeId: 'employee-1',
        occurredAt: new Date('2026-04-20T08:00:00.000Z'),
        reason: 'OUTSIDE_ALLOWED_RADIUS',
      }),
    ).resolves.toEqual({
      publicId: '2026-04-20/employee-1/outside_allowed_radius',
      secureUrl:
        'https://res.cloudinary.com/konatech-test/image/upload/photo.jpg',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns a clear timeout error when Cloudinary does not respond', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CLOUDINARY_CLOUD_NAME = 'konatech-test';
    process.env.CLOUDINARY_API_KEY = 'cloudinary-key';
    process.env.CLOUDINARY_API_SECRET = 'cloudinary-secret';
    process.env.CLOUDINARY_UPLOAD_TIMEOUT_MS = '1000';
    process.env.CLOUDINARY_UPLOAD_MAX_RETRIES = '0';
    process.env.CLOUDINARY_UPLOAD_RETRY_DELAY_MS = '1';

    const abortError = new Error('The operation was aborted.');
    abortError.name = 'AbortError';

    jest.spyOn(global, 'fetch').mockRejectedValueOnce(abortError);

    const service = new AttendancePhotoStorageService(new ConfigService());
    const photoDataUrl = `data:image/jpeg;base64,${Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.from('verification-photo'),
    ]).toString('base64')}`;

    await expect(
      service.uploadVerificationPhoto(photoDataUrl, {
        employeeId: 'employee-1',
        occurredAt: new Date('2026-04-20T08:00:00.000Z'),
        reason: 'OUTSIDE_ALLOWED_RADIUS',
      }),
    ).rejects.toThrow(GatewayTimeoutException);
  });
});
