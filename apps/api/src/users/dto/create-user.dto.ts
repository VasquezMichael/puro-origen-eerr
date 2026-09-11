import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BranchRole } from '../user-role.js';

export class BranchAccessDto {
  @IsMongoId({ message: 'Identificador de sucursal inválido' })
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
