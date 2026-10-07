import { Global, Module } from '@nestjs/common';
import { RateLimitStorageService } from './rate-limit-storage.service';

@Global()
@Module({
  providers: [RateLimitStorageService],
  exports: [RateLimitStorageService],
})
export class RateLimitStorageModule {}
