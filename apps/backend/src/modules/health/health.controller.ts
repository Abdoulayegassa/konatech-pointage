import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RateLimitStorageService } from '../../common/security/rate-limit-storage.service';
import { Public } from '../auth/decorators/public.decorator';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimitStorage: RateLimitStorageService,
  ) {}

  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'konatech-attendance-api',
      timestamp: new Date().toISOString(),
    };
  }
  @Get('ready')
  async getReadiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      if (
        process.env.NODE_ENV === 'production' &&
        !(await this.rateLimitStorage.isReady())
      ) {
        throw new Error('Redis is unavailable.');
      }
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable' });
    }

    return { status: 'ready' };
  }
}
