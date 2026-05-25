import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';
import {
  ATTENDANCE_ENTRY_PIN_LONG_THROTTLER_NAME,
  ATTENDANCE_ENTRY_PIN_SHORT_THROTTLER_NAME,
  ATTENDANCE_ENTRY_RATE_LIMIT_MESSAGE,
} from '../../modules/auth/constants/attendance-entry.constants';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(AppThrottlerGuard.name);

  protected async handleRequest(requestProps: ThrottlerRequest) {
    const {
      context,
      limit,
      ttl,
      throttler,
      blockDuration,
      getTracker,
      generateKey,
    } = requestProps;
    const { req, res } = this.getRequestResponse(context);
    const throttlerName = throttler.name ?? 'default';
    const ignoreUserAgents =
      throttler.ignoreUserAgents ?? this.commonOptions.ignoreUserAgents;

    if (Array.isArray(ignoreUserAgents)) {
      for (const pattern of ignoreUserAgents) {
        if (pattern.test(req.headers['user-agent'])) {
          return true;
        }
      }
    }

    const tracker = await getTracker(req, context);
    const key = generateKey(context, tracker, throttlerName);
    const { totalHits, timeToExpire, isBlocked, timeToBlockExpire } =
      await this.storageService.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    const getThrottlerSuffix = (name: string) =>
      name === 'default' ? '' : `-${name}`;
    const setHeaders =
      throttler.setHeaders ?? this.commonOptions.setHeaders ?? true;

    if (isBlocked) {
      if (setHeaders) {
        res.header(
          `Retry-After${getThrottlerSuffix(throttlerName)}`,
          timeToBlockExpire,
        );
      }

      if (this.isAttendanceEntryPinThrottler(throttlerName)) {
        this.logAttendanceEntryPinRateLimit(req, tracker, throttlerName);
        throw new HttpException(
          ATTENDANCE_ENTRY_RATE_LIMIT_MESSAGE,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      await this.throwThrottlingException(context, {
        limit,
        ttl,
        key,
        tracker,
        totalHits,
        timeToExpire,
        isBlocked,
        timeToBlockExpire,
      });
    }

    if (setHeaders) {
      res.header(
        `${this.headerPrefix}-Limit${getThrottlerSuffix(throttlerName)}`,
        limit,
      );
      res.header(
        `${this.headerPrefix}-Remaining${getThrottlerSuffix(throttlerName)}`,
        Math.max(0, limit - totalHits),
      );
      res.header(
        `${this.headerPrefix}-Reset${getThrottlerSuffix(throttlerName)}`,
        timeToExpire,
      );
    }

    return true;
  }

  private isAttendanceEntryPinThrottler(name: string) {
    return (
      name === ATTENDANCE_ENTRY_PIN_SHORT_THROTTLER_NAME ||
      name === ATTENDANCE_ENTRY_PIN_LONG_THROTTLER_NAME
    );
  }

  private logAttendanceEntryPinRateLimit(
    req: Record<string, any>,
    tracker: string,
    throttlerName: string,
  ) {
    const route = this.getRequestRoute(req);
    const userAgent = this.getUserAgent(req);
    const timestamp = new Date().toISOString();

    this.logger.warn(
      `Security rate-limit blocked route=${route} ip=${tracker} userAgent="${userAgent}" throttler=${throttlerName} timestamp=${timestamp}`,
    );
  }

  private getRequestRoute(req: Record<string, any>) {
    const route = req.originalUrl ?? req.url ?? 'unknown';

    return typeof route === 'string' ? route : 'unknown';
  }

  private getUserAgent(req: Record<string, any>) {
    const userAgent = req.headers?.['user-agent'];

    return typeof userAgent === 'string' && userAgent.trim().length > 0
      ? userAgent
      : 'unknown';
  }
}
