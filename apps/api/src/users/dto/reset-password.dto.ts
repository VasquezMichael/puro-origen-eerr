import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @MinLength(12)
  password!: string;

  @IsOptional()
  @IsBoolean()
  requireChange?: boolean;
}
