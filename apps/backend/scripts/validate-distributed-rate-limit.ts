import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { RateLimitStorageService } from '../src/common/security/rate-limit-storage.service';
import { getSafeErrorSummary } from '../src/common/security/sensitive-data.util';

async function validate() {
  const redisUrl = process.env.RATE_LIMIT_REDIS_URL;
  if (!redisUrl) throw new Error('RATE_LIMIT_REDIS_URL is required.');

  const config = new ConfigService({ RATE_LIMIT_REDIS_URL: redisUrl });
  const instances = Array.from(
    { length: 4 },
    () => new RateLimitStorageService(config),
  );
  await Promise.all(instances.map((instance) => instance.onModuleInit()));
  const suffix = randomUUID();

  const results = await Promise.all(
    Array.from({ length: 120 }, (_, index) =>
      instances[index % instances.length].increment(
        `load:${suffix}`,
        60_000,
        40,
        60_000,
        'load',
      ),
    ),
  );
  if (results.filter((result) => !result.isBlocked).length !== 40) {
    throw new Error('The distributed request limit was not atomic.');
  }

  await Promise.all(
    Array.from({ length: 60 }, (_, index) =>
      instances[index % instances.length].recordFailure(
        `auth:${suffix}`,
        60_000,
      ),
    ),
  );
  if ((await instances[0].failureCount(`auth:${suffix}`, 60_000)) !== 60) {
    throw new Error('Authentication failures were not shared atomically.');
  }

  await Promise.all(
    instances.slice(1).map((instance) => instance.onModuleDestroy()),
  );
  const survivingInstance = instances[0];
  const control = createClient({
    url: redisUrl,
    socket: { reconnectStrategy: false },
  });
  control.on('error', () => undefined);
  await control.connect();
  await control.sendCommand(['SHUTDOWN', 'NOSAVE']).catch(() => undefined);
  if (control.isOpen) control.destroy();

  const startedAt = Date.now();
  try {
    await survivingInstance.increment(
      `outage:${suffix}`,
      60_000,
      1,
      60_000,
      'outage',
    );
    throw new Error('Redis outage unexpectedly failed open.');
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status !== 503) throw error;
  } finally {
    await survivingInstance.onModuleDestroy();
  }
  if (Date.now() - startedAt >= 1_000) {
    throw new Error('Redis outage did not fail closed within one second.');
  }

  console.log('Distributed rate-limit load and resilience validation passed.');
}

void validate().catch((error: unknown) => {
  console.error(
    `Distributed rate-limit validation failed: ${getSafeErrorSummary(error)}.`,
  );
  process.exitCode = 1;
});
