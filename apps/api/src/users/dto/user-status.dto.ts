import { IsBoolean } from 'class-validator';

export class UserStatusDto {
  @IsBoolean()
  active!: boolean;
}
