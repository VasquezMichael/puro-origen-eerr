import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { BranchAccessDto } from './create-user.dto.js';

export class AssignBranchAccessesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BranchAccessDto)
  branchAccesses!: BranchAccessDto[];
}
