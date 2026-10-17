import { Transform } from 'class-transformer';
import { IsInt, IsMongoId, IsOptional, IsString, Matches, Max, Min, ValidateIf } from 'class-validator';

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

export class EerrTransitionDto {
  @IsInt({ message: 'expectedRevision debe ser un entero' })
  @Min(0)
  expectedRevision!: number;
}

export class ListEerrDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsMongoId({ message: 'Identificador de sucursal inválido' })
  branchId?: string;
}

// Las query strings son texto; solo convertir una representación decimal entera.
const queryInteger = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
const targetMarginQueryPattern = /^(?:0|[1-9]\d{0,2})(?:\.\d{1,4})?$/;

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

export class ComparisonPeriodsDto extends EerrMonthDto {
  @Transform(queryInteger)
  @IsInt()
  @Min(1)
  @Max(9999)
  referenceYear!: number;

  @Transform(queryInteger)
  @IsInt()
  @Min(1)
  @Max(12)
  referenceMonth!: number;
}

export class DashboardQueryDto extends EerrMonthDto {
  @IsOptional()
  @IsString()
  @Matches(targetMarginQueryPattern, { message: 'targetNetMargin debe ser un decimal no negativo con hasta cuatro cifras decimales' })
  targetNetMargin?: string;
}

export class ConsolidatedComparisonDto extends ComparisonPeriodsDto {
  @IsOptional()
  @IsString()
  @Matches(targetMarginQueryPattern, { message: 'targetNetMargin debe ser un decimal no negativo con hasta cuatro cifras decimales' })
  targetNetMargin?: string;
}

export class BranchComparisonDto extends EerrMonthDto {
  @IsMongoId()
  branchId!: string;

  @IsMongoId()
  referenceBranchId!: string;
}

export class BranchParamDto {
  @IsMongoId()
  branchId!: string;
}
