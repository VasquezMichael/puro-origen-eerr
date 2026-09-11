import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsString,
  ValidateIf,
} from 'class-validator';
import { cleanBranchName } from '../branch-name.js';

const cleanName = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? cleanBranchName(value) : value;

export class CreateBranchDto {
  @Transform(cleanName)
  @IsString({ message: 'El nombre debe ser un texto' })
  @IsNotEmpty({ message: 'El nombre de la sucursal es obligatorio' })
  name!: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString(
    { strict: true },
    { message: 'La fecha de inicio debe ser válida' },
  )
  startDate?: string;
}

export class UpdateBranchDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(cleanName)
  @IsString({ message: 'El nombre debe ser un texto' })
  @IsNotEmpty({ message: 'El nombre de la sucursal es obligatorio' })
  name?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsDateString(
    { strict: true },
    { message: 'La fecha de inicio debe ser válida' },
  )
  startDate?: string;
}

export class BranchStatusDto {
  @IsBoolean({ message: 'El estado activo debe ser verdadero o falso' })
  active!: boolean;
}
