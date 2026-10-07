import { Module } from '@nestjs/common';
import { AuditLogModule } from '../../common/audit/audit-log.module';
import { CalendarModule } from '../calendar/calendar.module';
import { SanctionsController } from './sanctions.controller';
import { SanctionsService } from './sanctions.service';

@Module({
  imports: [AuditLogModule, CalendarModule],
  controllers: [SanctionsController],
  providers: [SanctionsService],
  exports: [SanctionsService],
})
export class SanctionsModule {}
