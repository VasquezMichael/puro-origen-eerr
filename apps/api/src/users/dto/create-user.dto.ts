import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BranchRole } from '../user-role.js';

export class BranchAccessDto {
  @IsString()
  @MinLength(1)
  branchId!: string;

  @IsEnum(BranchRole)
  role!: BranchRole;
}

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12)
  password!: string;

  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BranchAccessDto)
  branchAccesses?: BranchAccessDto[];
}
