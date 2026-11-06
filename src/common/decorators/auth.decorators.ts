import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route as public (skips the JwtAuthGuard). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Extracts the authenticated user from the request (set by JwtAuthGuard). */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);

/** Required roles for a route (enforced by RolesGuard). */
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

/** Required permissions for a route (enforced by PermissionsGuard, SRS §80). */
export const Permissions = (...perms: string[]) => SetMetadata('permissions', perms);
