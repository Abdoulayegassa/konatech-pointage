import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RateLimitStorageService } from '../../common/security/rate-limit-storage.service';

type AttemptPolicy = {
  name: string;
  limit: number;
  ttlMs: number;
};

@Injectable()
export class AuthenticationAttemptLimiterService {
  private readonly logger = new Logger(
    AuthenticationAttemptLimiterService.name,
  );

  constructor(private readonly storage: RateLimitStorageService) {}

  async assertAllowed(
    scope: string,
    ip: string,
    subject: string,
    policies: AttemptPolicy[],
    message: string,
  ) {
    const tracker = this.tracker(scope, ip, subject);

    for (const policy of policies) {
      const key = `${policy.name}:${tracker}`;
      const failureCount = await this.storage.failureCount(key, policy.ttlMs);

      if (failureCount >= policy.limit) {
        this.logger.warn(
          `Security authentication rate-limit blocked scope=${scope} tracker=${tracker} policy=${policy.name}`,
        );
        throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
      }
    }
  }

  async recordFailure(
    scope: string,
    ip: string,
    subject: string,
    policies: AttemptPolicy[],
  ) {
    const tracker = this.tracker(scope, ip, subject);

    for (const policy of policies) {
      const key = `${policy.name}:${tracker}`;
      await this.storage.recordFailure(key, policy.ttlMs);
    }
  }

  async clear(
    scope: string,
    ip: string,
    subject: string,
    policies: AttemptPolicy[],
  ) {
    const tracker = this.tracker(scope, ip, subject);
    await this.storage.clearFailures(
      policies.map((policy) => `${policy.name}:${tracker}`),
    );
  }

  private tracker(scope: string, ip: string, subject: string) {
    return createHash('sha256')
      .update(`${scope}\u0000${ip}\u0000${subject.trim().toLowerCase()}`)
      .digest('hex');
  }
}
