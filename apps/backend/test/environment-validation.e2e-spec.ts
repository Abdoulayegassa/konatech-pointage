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
    const photoDataUrl = `data:image/jpeg;base64,${Buffer.from(
      'verification-photo',
    ).toString('base64')}`;

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
    const photoDataUrl = `data:image/jpeg;base64,${Buffer.from(
      'verification-photo',
    ).toString('base64')}`;

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
    const photoDataUrl = `data:image/jpeg;base64,${Buffer.from(
      'verification-photo',
    ).toString('base64')}`;

    await expect(
      service.uploadVerificationPhoto(photoDataUrl, {
        employeeId: 'employee-1',
        occurredAt: new Date('2026-04-20T08:00:00.000Z'),
        reason: 'OUTSIDE_ALLOWED_RADIUS',
      }),
    ).rejects.toThrow(GatewayTimeoutException);
  });
});
