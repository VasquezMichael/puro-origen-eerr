import {
  IsUUID,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  IsBoolean,
} from 'class-validator';
import type { CloneMode } from '@puro-origen/domain';
export class ClonePreviewDto {
  @IsUUID('4') sourceEerrId!: string;
  @IsIn(['ESTRUCTURA', 'ESTRUCTURA_Y_VALORES']) mode!: CloneMode;
}
export class CloneConfirmDto extends ClonePreviewDto {
  @IsString() @MinLength(1) @MaxLength(4096) previewToken!: string;
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  confirmCrossBranchValues?: boolean;
}
