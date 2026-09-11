import { SetMetadata } from '@nestjs/common';
import { ADMIN_ONLY, IS_PUBLIC } from './auth.constants.js';

export const Public = () => SetMetadata(IS_PUBLIC, true);
export const AdminOnly = () => SetMetadata(ADMIN_ONLY, true);
