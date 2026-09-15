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
  @MaxLength(80)
  input?: string;
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
