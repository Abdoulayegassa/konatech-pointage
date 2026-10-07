import { OmitType } from '@nestjs/mapped-types';
import { CreateScheduleDto } from './create-schedule.dto';

/** Site is derived from the route and verified against the authenticated organization. */
export class CreateSiteScheduleDto extends OmitType(CreateScheduleDto, [
  'siteId',
] as const) {}
