import {
  Equals,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  EXPRESSION_LIMITS,
  QUANTITY_LIMITS,
  NOTE_LIMITS,
} from '@puro-origen/domain';

export class RevisionDto {
  @IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER) expectedRevision!: number;
}
export class ItemDto extends RevisionDto {
  @IsUUID('4') parentId!: string;
  @IsString() @MaxLength(120) name!: string;
  @ValidateIf((_o, value) => value !== undefined)
  @IsBoolean()
  quantityEnabled?: boolean;
  @ValidateIf((_o, value) => value !== undefined)
  @IsString()
  @MaxLength(40)
  unit?: string;
}
export class RenameItemDto extends RevisionDto {
  @IsString() @MaxLength(120) name!: string;
}
export class AmountDto extends RevisionDto {
  @IsIn(['SIN_CARGAR', 'CARGADO']) state!: 'SIN_CARGAR' | 'CARGADO';
  @ValidateIf((o: AmountDto) => o.state === 'CARGADO')
  @IsString()
  @MaxLength(EXPRESSION_LIMITS.length)
  input?: string;
}
export class QuantityDto extends RevisionDto {
  @IsIn(['SIN_CARGAR', 'CARGADO']) state!: 'SIN_CARGAR' | 'CARGADO';
  @ValidateIf((o: QuantityDto) => o.state === 'CARGADO')
  @IsString()
  @MaxLength(QUANTITY_LIMITS.length)
  input?: string;
}
export class ItemNoteDto extends RevisionDto {
  @IsString() @MaxLength(NOTE_LIMITS.item) note!: string;
}
export class PeriodNoteDto extends RevisionDto {
  @IsString() @MaxLength(NOTE_LIMITS.period) note!: string;
}
export class CategoryPreviewDto extends RevisionDto {
  @IsIn(['CREATE', 'RENAME']) operation!: 'CREATE' | 'RENAME';
  @IsString() @MaxLength(120) name!: string;
  @ValidateIf((o: CategoryPreviewDto) => o.operation === 'CREATE')
  @IsUUID('4')
  parentCode?: string;
  @ValidateIf((o: CategoryPreviewDto) => o.operation === 'RENAME')
  @IsUUID('4')
  code?: string;
}
export class CategoryConfirmDto extends RevisionDto {
  @IsUUID('4') previewId!: string;
  @Equals(true) confirm!: true;
}
