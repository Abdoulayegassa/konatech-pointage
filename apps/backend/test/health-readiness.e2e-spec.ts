import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from '../src/modules/health/health.controller';

describe('production readiness', () => {
  const previousNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  });

  it('reports ready only when PostgreSQL and production Redis respond', async () => {
    process.env.NODE_ENV = 'production';
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([1]) };
    const rateLimitStorage = { isReady: jest.fn().mockResolvedValue(true) };
    const controller = new HealthController(
      prisma as never,
      rateLimitStorage as never,
    );

    await expect(controller.getReadiness()).resolves.toEqual({
      status: 'ready',
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(rateLimitStorage.isReady).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['PostgreSQL', true, false],
    ['Redis', false, true],
  ])(
    'fails closed when %s is unavailable',
    async (_name, dbFails, redisFails) => {
      process.env.NODE_ENV = 'production';
      const prisma = {
        $queryRaw: dbFails
          ? jest.fn().mockRejectedValue(new Error('database unavailable'))
          : jest.fn().mockResolvedValue([1]),
      };
      const rateLimitStorage = {
        isReady: jest.fn().mockResolvedValue(!redisFails),
      };
      const controller = new HealthController(
        prisma as never,
        rateLimitStorage as never,
      );

      await expect(controller.getReadiness()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    },
  );
});
