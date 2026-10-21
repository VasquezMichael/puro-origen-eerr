import { SetMetadata } from '@nestjs/common';
import { ADMIN_ONLY, IS_PUBLIC, PASSWORD_CHANGE_ALLOWED } from './auth.constants.js';

export const Public = () => SetMetadata(IS_PUBLIC, true);
export const AdminOnly = () => SetMetadata(ADMIN_ONLY, true);
export const AllowPasswordChangeRequired = () =>
  SetMetadata(PASSWORD_CHANGE_ALLOWED, true);
