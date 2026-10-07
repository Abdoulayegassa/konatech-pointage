import { Global, Module } from '@nestjs/common';
import { OrganizationTimezoneService } from './organization-timezone.service';

@Global()
@Module({
  providers: [OrganizationTimezoneService],
  exports: [OrganizationTimezoneService],
})
export class OrganizationTimezoneModule {}
