import { SetMetadata } from '@nestjs/common';
import { StaffRole } from '@udyamone/shared-types';
import { AUTH_CONFIG } from '../auth.constants';

export const Roles = (...roles: StaffRole[]) => SetMetadata(AUTH_CONFIG.ROLES_KEY, roles);
