import { Transform } from 'class-transformer';
import { AccessRole } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  DISALLOWED_EMPLOYEE_PIN_CODES,
  EMPLOYEE_PIN_CODE_PATTERN,
  INVALID_EMPLOYEE_PIN_MESSAGE,
} from '../../../common/validation/pin-code.validation';

export class UpdateEmployeeDto {
  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(EMPLOYEE_PIN_CODE_PATTERN, {
    message: INVALID_EMPLOYEE_PIN_MESSAGE,
  })
  @IsNotIn([...DISALLOWED_EMPLOYEE_PIN_CODES], {
    message: INVALID_EMPLOYEE_PIN_MESSAGE,
  })
  pinCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  role?: string;

  @IsOptional()
  @IsEnum(AccessRole)
  accessRole?: AccessRole;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(80)
  department?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  scheduleId?: string | null;
}
