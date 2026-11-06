import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * Permission-Based Access Control for Admins (SRS §80, §81). Super Admin
 * bypasses; Admins need the exact permission(s) declared on the route.
 *
 * Example permissions (SRS §80):
 *   PROPERTY_VIEW, PROPERTY_VERIFY, OWNER_APPROVE, REQUEST_MANAGE,
 *   VISIT_MANAGE, BOOKING_MANAGE, PAYMENT_MANAGE, REPORT_MANAGE,
 *   AUDIT_VIEW, ADMIN_MANAGE, SYSTEM_CONFIGURATION, TERMS_MANAGE
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>('permissions', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException('Not authenticated');

    // Super Admin has every permission (SRS §5.5).
    if (user.role === 'super_admin') return true;

    const userPerms: string[] = Array.isArray(user.permissions) ? user.permissions : [];
    const ok = required.every((p) => userPerms.includes(p));
    if (!ok) {
      throw new ForbiddenException(`Missing permission(s): ${required.join(', ')}`);
    }
    return true;
  }
}
