import { IsString, Matches } from 'class-validator';

export class AttendanceEntryLoginDto {
  @IsString()
  @Matches(/^\d{4}$/, {
    message: 'Le code PIN doit contenir exactement 4 chiffres.',
  })
  pinCode!: string;
}
