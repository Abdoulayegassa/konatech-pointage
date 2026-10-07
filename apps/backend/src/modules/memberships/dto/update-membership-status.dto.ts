import { MembershipStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateMembershipStatusDto {
  @IsEnum(MembershipStatus)
  status!: MembershipStatus;
}
