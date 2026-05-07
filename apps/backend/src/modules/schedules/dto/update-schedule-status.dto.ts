import { IsBoolean } from 'class-validator';

export class UpdateScheduleStatusDto {
  @IsBoolean()
  isActive!: boolean;
}
