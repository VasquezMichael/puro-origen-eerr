import { Transform } from 'class-transformer';
import { IsInt, IsMongoId, Max, Min, ValidateIf } from 'class-validator';

export class CreateEerrDto {
  @IsMongoId({ message: 'Identificador de sucursal inválido' })
  branchId!: string;

  @IsInt({ message: 'El año debe ser un número entero' })
  @Min(1)
  @Max(9999)
  year!: number;

  @IsInt({ message: 'El mes debe ser un número entero' })
  @Min(1)
  @Max(12)
  month!: number;
}

export class ListEerrDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsMongoId({ message: 'Identificador de sucursal inválido' })
  branchId?: string;
}

// Las query strings son texto; solo convertir una representación decimal entera.
const queryInteger = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;

export class EerrMonthDto {
  @Transform(queryInteger)
  @IsInt({ message: 'El año debe ser un número entero' })
  @Min(1)
  @Max(9999)
  year!: number;

  @Transform(queryInteger)
  @IsInt({ message: 'El mes debe ser un número entero' })
  @Min(1)
  @Max(12)
  month!: number;
}
