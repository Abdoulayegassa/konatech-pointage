import {
  BadRequestException,
  Controller,
  Get,
  INestApplication,
  Logger,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuditLogService } from '../src/common/audit/audit-log.service';
import { ProductionExceptionFilter } from '../src/common/errors/production-exception.filter';
import {
  getSafeErrorSummary,
  sanitizeAuditMetadata,
  sanitizeLogText,
  sanitizeRequestPath,
} from '../src/common/security/sensitive-data.util';

const leakedSecret = 'phase1f13-super-secret-password';
const leakedJwt =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzZWNyZXQifQ.signature-do-not-log';

@Controller('operational-test')
class OperationalTestController {
  @Get('failure')
  failure() {
    throw new Error(
      `database postgresql://admin:${leakedSecret}@db.internal/app ${leakedJwt}`,
    );
  }

  @Get('bad-request')
  badRequest() {
    throw new BadRequestException('Invalid request.');
  }
}

describe('operational sensitive-data protection', () => {
  let app: INestApplication;
  let previousNodeEnv: string | undefined;
  let errorSpy: jest.SpyInstance;

  beforeAll(async () => {
    previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const fixture = await Test.createTestingModule({
      controllers: [OperationalTestController],
      providers: [
        AuditLogService,
        { provide: APP_FILTER, useClass: ProductionExceptionFilter },
      ],
    }).compile();
    app = fixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    errorSpy.mockRestore();
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  });

  it('returns generic production 5xx responses and logs no internal detail', async () => {
    const response = await request(app.getHttpServer())
      .get(`/operational-test/failure?token=${leakedSecret}`)
      .set('Authorization', `Bearer ${leakedJwt}`)
      .expect(500);

    expect(response.body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
    });
    const logged = JSON.stringify(errorSpy.mock.calls);
    expect(logged).not.toContain(leakedSecret);
    expect(logged).not.toContain(leakedJwt);
    expect(logged).not.toContain('postgresql://');
    expect(logged).not.toContain('token=');
  });

  it('preserves intentional generic 4xx responses', async () => {
    await request(app.getHttpServer())
      .get('/operational-test/bad-request')
      .expect(400, {
        message: 'Invalid request.',
        error: 'Bad Request',
        statusCode: 400,
      });
  });

  it('redacts credentials, tokens and unsafe log characters', () => {
    expect(
      sanitizeLogText(
        `Bearer ${leakedJwt}\nredis://default:${leakedSecret}@redis.internal`,
      ),
    ).toBe('Bearer [REDACTED] redis://[REDACTED]@redis.internal');
    expect(sanitizeRequestPath(`/route?token=${leakedSecret}`)).toBe('/route');
    expect(
      getSafeErrorSummary(
        Object.assign(new Error(leakedSecret), { code: 'P1001' }),
      ),
    ).toBe('Error (P1001)');
  });

  it('redacts sensitive audit metadata recursively', () => {
    expect(
      sanitizeAuditMetadata({
        action: 'invitation.accept',
        password: leakedSecret,
        nested: { tokenHash: leakedSecret, authorization: leakedJwt },
        databaseUrl: `postgresql://admin:${leakedSecret}@db/app`,
      }),
    ).toEqual({
      action: 'invitation.accept',
      password: '[REDACTED]',
      nested: { tokenHash: '[REDACTED]', authorization: '[REDACTED]' },
      databaseUrl: '[REDACTED]',
    });
  });
});
