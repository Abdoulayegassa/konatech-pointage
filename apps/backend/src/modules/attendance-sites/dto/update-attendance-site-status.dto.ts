import { IsBoolean } from 'class-validator';
export class UpdateAttendanceSiteStatusDto {
  @IsBoolean() isActive!: boolean;
}
