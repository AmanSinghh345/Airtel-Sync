import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { StaffJwtPayload } from '@udyamone/shared-types';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): StaffJwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  }
);
