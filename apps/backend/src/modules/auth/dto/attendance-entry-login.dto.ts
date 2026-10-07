import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class AttendanceEntryLoginDto {
  @IsOptional()
  @IsUUID()
  sitePublicId?: string;

  @IsString()
  @Matches(/^\d{4}$/, {
    message: 'Le code PIN doit contenir exactement 4 chiffres.',
  })
  pinCode!: string;
}
