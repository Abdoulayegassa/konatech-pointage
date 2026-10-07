import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerStorage } from '@nestjs/throttler';
import { createClient, RedisClientType } from 'redis';

type MemoryCounter = { hits: number; expiresAt: number; blockedUntil: number };

@Injectable()
export class RateLimitStorageService
  implements ThrottlerStorage, OnModuleInit, OnModuleDestroy
{
  private static readonly MAX_MEMORY_KEYS = 10_000;
  private readonly logger = new Logger(RateLimitStorageService.name);
  private readonly memoryCounters = new Map<string, MemoryCounter>();
  private readonly memoryFailures = new Map<string, number[]>();
  private readonly redisUrl?: string;
  private readonly connectTimeoutMs: number;
  private readonly commandTimeoutMs: number;
  private lastConnectionErrorLogAt = 0;
  private redis?: RedisClientType;

  constructor(config: ConfigService) {
    this.redisUrl = config.get<string>('RATE_LIMIT_REDIS_URL')?.trim();
    this.connectTimeoutMs =
      config.get<number>('RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS') ?? 2_000;
    this.commandTimeoutMs =
      config.get<number>('RATE_LIMIT_REDIS_COMMAND_TIMEOUT_MS') ?? 5_000;
  }

  async onModuleInit() {
    if (!this.redisUrl) {
      this.logger.warn(
        'Rate limiting uses bounded process-local memory; production requires RATE_LIMIT_REDIS_URL.',
      );
      return;
    }

    this.redis = createClient({
      url: this.redisUrl,
      commandsQueueMaxLength: 1_000,
      disableOfflineQueue: true,
      socket: {
        connectTimeout: this.connectTimeoutMs,
        reconnectStrategy: (retries) => Math.min(50 * 2 ** retries, 1_000),
      },
    });
    this.redis.on('error', () => this.logConnectionError());
    try {
      await this.redis.connect();
    } catch {
      this.logger.error('Redis rate-limit storage is unavailable at startup.');
      throw new Error('Distributed rate-limit storage is unavailable.');
    }
    this.logger.log('Distributed Redis rate-limit storage connected.');
  }

  async onModuleDestroy() {
    if (this.redis?.isOpen) this.redis.destroy();
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    _throttlerName: string,
  ) {
    if (!this.redis) {
      return this.incrementMemory(key, ttl, limit, blockDuration);
    }

    const result = (await this.executeRedis(() =>
      this.redis!.eval(THROTTLE_LUA, {
        keys: [`konatech:rate-limit:${key}`],
        arguments: [String(ttl), String(limit), String(blockDuration || ttl)],
      }),
    )) as [number, number, number, number];

    return {
      totalHits: Number(result[0]),
      timeToExpire: Math.max(0, Math.ceil(Number(result[1]) / 1000)),
      isBlocked: Number(result[2]) === 1,
      timeToBlockExpire: Math.max(0, Math.ceil(Number(result[3]) / 1000)),
    };
  }

  async failureCount(key: string, ttlMs: number) {
    const now = Date.now();
    if (!this.redis) {
      return this.recentMemoryFailures(key, now, ttlMs).length;
    }

    return Number(
      await this.executeRedis(() =>
        this.redis!.eval(FAILURE_COUNT_LUA, {
          keys: [`konatech:auth-failure:${key}`],
          arguments: [String(now - ttlMs), String(ttlMs)],
        }),
      ),
    );
  }

  async recordFailure(key: string, ttlMs: number) {
    const now = Date.now();
    if (!this.redis) {
      const recent = this.recentMemoryFailures(key, now, ttlMs);
      recent.push(now);
      this.memoryFailures.set(key, recent);
      this.compactMemory(now);
      return;
    }

    await this.executeRedis(() =>
      this.redis!.eval(FAILURE_RECORD_LUA, {
        keys: [`konatech:auth-failure:${key}`],
        arguments: [
          String(now - ttlMs),
          `${now}:${crypto.randomUUID()}`,
          String(now),
          String(ttlMs),
        ],
      }),
    );
  }

  async clearFailures(keys: string[]) {
    if (!this.redis) {
      keys.forEach((key) => this.memoryFailures.delete(key));
      return;
    }

    if (keys.length > 0) {
      await this.executeRedis(() =>
        this.redis!.del(keys.map((key) => `konatech:auth-failure:${key}`)),
      );
    }
  }

  memoryStateSize() {
    return this.memoryCounters.size + this.memoryFailures.size;
  }

  async isReady() {
    if (!this.redis) return false;

    try {
      return (await this.executeRedis(() => this.redis!.ping())) === 'PONG';
    } catch {
      return false;
    }
  }

  private async executeRedis<T>(operation: () => Promise<T>) {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Redis command timeout.')),
            this.commandTimeoutMs,
          );
        }),
      ]);
    } catch {
      this.logger.error('Distributed rate-limit operation failed closed.');
      throw new ServiceUnavailableException('Service temporarily unavailable.');
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private logConnectionError() {
    const now = Date.now();
    if (now - this.lastConnectionErrorLogAt < 10_000) return;
    this.lastConnectionErrorLogAt = now;
    this.logger.error('Redis rate-limit storage connection error.');
  }

  private incrementMemory(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ) {
    const now = Date.now();
    const existing = this.memoryCounters.get(key);
    const counter =
      !existing || existing.expiresAt <= now
        ? { hits: 0, expiresAt: now + ttl, blockedUntil: 0 }
        : existing;

    counter.hits += 1;
    if (counter.hits > limit && counter.blockedUntil <= now) {
      counter.blockedUntil = now + (blockDuration || ttl);
    }
    this.memoryCounters.set(key, counter);
    this.compactMemory(now);

    return {
      totalHits: counter.hits,
      timeToExpire: Math.max(0, Math.ceil((counter.expiresAt - now) / 1000)),
      isBlocked: counter.blockedUntil > now,
      timeToBlockExpire: Math.max(
        0,
        Math.ceil((counter.blockedUntil - now) / 1000),
      ),
    };
  }

  private recentMemoryFailures(key: string, now: number, ttlMs: number) {
    const recent = (this.memoryFailures.get(key) ?? []).filter(
      (timestamp) => timestamp > now - ttlMs,
    );
    if (recent.length === 0) this.memoryFailures.delete(key);
    else this.memoryFailures.set(key, recent);
    return recent;
  }

  private compactMemory(now: number) {
    if (
      this.memoryCounters.size + this.memoryFailures.size <
      RateLimitStorageService.MAX_MEMORY_KEYS
    ) {
      return;
    }

    for (const [key, counter] of this.memoryCounters) {
      if (counter.expiresAt <= now && counter.blockedUntil <= now) {
        this.memoryCounters.delete(key);
      }
    }
    while (
      this.memoryCounters.size + this.memoryFailures.size >=
      RateLimitStorageService.MAX_MEMORY_KEYS
    ) {
      const failureKey = this.memoryFailures.keys().next().value as
        | string
        | undefined;
      const counterKey = this.memoryCounters.keys().next().value as
        | string
        | undefined;
      if (failureKey) this.memoryFailures.delete(failureKey);
      else if (counterKey) this.memoryCounters.delete(counterKey);
      else break;
    }
  }
}

const THROTTLE_LUA = `
local blocked = redis.call('PTTL', KEYS[1] .. ':blocked')
if blocked > 0 then
  local hits = tonumber(redis.call('GET', KEYS[1]) or '0')
  return {hits, redis.call('PTTL', KEYS[1]), 1, blocked}
end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local window = redis.call('PTTL', KEYS[1])
if hits > tonumber(ARGV[2]) then
  redis.call('PSETEX', KEYS[1] .. ':blocked', ARGV[3], '1')
  return {hits, window, 1, tonumber(ARGV[3])}
end
return {hits, window, 0, 0}
`;

const FAILURE_COUNT_LUA = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return redis.call('ZCARD', KEYS[1])
`;

const FAILURE_RECORD_LUA = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
redis.call('ZADD', KEYS[1], ARGV[3], ARGV[2])
redis.call('PEXPIRE', KEYS[1], ARGV[4])
return redis.call('ZCARD', KEYS[1])
`;
