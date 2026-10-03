import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';

/** Route does not require a session. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Route requires one of the roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  timezone: string;
  checkInTime: string;
  restDays: number[];
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

export const RAW_RESPONSE = 'rawResponse';
/** Skip the { success, data } envelope (e.g. /health for load balancers). */
export const RawResponse = () => SetMetadata(RAW_RESPONSE, true);
