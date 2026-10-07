import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateScheduleDto } from './create-schedule.dto';

/** A schedule's site is immutable once created; use a new schedule instead. */
export class UpdateScheduleDto extends PartialType(
  OmitType(CreateScheduleDto, ['siteId'] as const),
) {}
