import { Controller, Get, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { validateSecurityConfig } from '../src/app.module';
import {
  configureTrustedProxy,
  getClientIp,
  parseTrustedProxyCidrs,
} from '../src/common/security/client-ip';
import { RateLimitStorageService } from '../src/common/security/rate-limit-storage.service';

jest.setTimeout(30_000);

@Controller('client-ip')
class ClientIpController {
  @Get()
  read(@Req() req: { ip?: string }) {
    return { ip: req.ip };
  }
}

describe('Distributed rate limiting and proxy hardening', () => {
  async function createIpApplication(trustedCidrs?: string) {
    const fixture = await Test.createTestingModule({
      controllers: [ClientIpController],
    }).compile();
    const app = fixture.createNestApplication();
    configureTrustedProxy(
      app.getHttpAdapter().getInstance(),
      new ConfigService({
        TRUST_PROXY_CIDRS: trustedCidrs,
        TRUST_PROXY_HOPS: 0,
      }),
    );
    await app.init();
    return app;
  }

  it('ignores a forged X-Forwarded-For header from an untrusted peer', async () => {
    const app = await createIpApplication();
    try {
      const response = await request(app.getHttpServer())
        .get('/client-ip')
        .set('X-Forwarded-For', '198.51.100.44')
        .expect(200);
      expect(response.body.ip).not.toBe('198.51.100.44');
    } finally {
      await app.close();
    }
  });

  it('uses the forwarded client IP only when the direct proxy is trusted', async () => {
    const app = await createIpApplication('loopback');
    try {
      const response = await request(app.getHttpServer())
        .get('/client-ip')
        .set('X-Forwarded-For', '198.51.100.44')
        .expect(200);
      expect(response.body.ip).toBe('198.51.100.44');
    } finally {
      await app.close();
    }
  });

  it('keeps resolved client-IP keys isolated under concurrent computation', async () => {
    const resolved = await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        Promise.resolve(getClientIp({ ip: `203.0.113.${(index % 100) + 1}` })),
      ),
    );
    expect(new Set(resolved).size).toBe(100);
  });

  it('prefers explicit trusted CIDRs and parses them deterministically', () => {
    expect(parseTrustedProxyCidrs(' loopback, 10.0.0.0/8 ,,')).toEqual([
      'loopback',
      '10.0.0.0/8',
    ]);
  });

  it('requires shared Redis storage and trusted proxy CIDRs in production', () => {
    const production = {
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://pointage.example.com',
      JWT_SECRET: 'vR9!Km2#Qx7@Wp4$Bn8&Hs5*Ld3%Tf6Z',
      DATABASE_URL:
        'postgresql://app:password@db.example.com/attendance?sslmode=require',
    };

    expect(() => validateSecurityConfig(production)).toThrow(
      'RATE_LIMIT_REDIS_URL is required in production',
    );
    expect(() =>
      validateSecurityConfig({
        ...production,
        RATE_LIMIT_REDIS_URL:
          'rediss://default:password@redis.example.com:6379',
      }),
    ).toThrow('TRUST_PROXY_CIDRS is required in production');
    expect(() =>
      validateSecurityConfig({
        ...production,
        RATE_LIMIT_REDIS_URL:
          'rediss://default:password@redis.example.com:6379',
        TRUST_PROXY_CIDRS: '10.0.0.0/8',
      }),
    ).not.toThrow();
  });

  it('keeps fallback memory bounded and isolates independent keys', async () => {
    const storage = new RateLimitStorageService(new ConfigService({}));
    const first = await storage.increment('tenant-a', 60_000, 2, 60_000, 'x');
    const second = await storage.increment('tenant-b', 60_000, 2, 60_000, 'x');
    expect(first.totalHits).toBe(1);
    expect(second.totalHits).toBe(1);

    for (let index = 0; index < 10_050; index += 1) {
      await storage.recordFailure(`subject-${index}`, 600_000);
    }
    expect(storage.memoryStateSize()).toBeLessThanOrEqual(10_000);
  });
});
