import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StaffRole } from '@udyamone/shared-types';
import { AUTH_CONFIG } from '../auth.constants';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<StaffRole[]>(
      AUTH_CONFIG.ROLES_KEY,
      [context.getHandler(), context.getClass()]
    );

    // If no roles specified, allow (as long as authentication guard already passed)
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role) {
      throw new UnauthorizedException('Authentication context missing or invalid.');
    }

    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException(
        `Staff role '${user.role}' is not authorized to perform this operation. Required: ${requiredRoles.join(', ')}.`
      );
    }

    return true;
  }
}
