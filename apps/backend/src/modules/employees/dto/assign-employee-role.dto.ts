import { IsString, MaxLength } from 'class-validator';

export class AssignEmployeeRoleDto {
  @IsString()
  @MaxLength(80)
  role!: string;
}
