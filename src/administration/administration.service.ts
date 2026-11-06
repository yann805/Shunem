import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';

/** Administration (SRS §44, §45, §48, §80). Owner approval, admin management. */
@Injectable()
export class AdministrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ---- Owner applications (SRS §12, §45) ----
  async listOwnerApplications() {
    return this.prisma.owner.findMany({
      include: { user: { select: { id: true, email: true, displayName: true, phone: true, city: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveOwner(ownerId: string, adminId: string) {
    const owner = await this.prisma.owner.update({
      where: { userId: ownerId },
      data: { status: 'approved', verificationStatus: 'verified' },
    });
    await this.prisma.user.update({ where: { id: ownerId }, data: { role: 'owner' } });
    await this.notifications.create({
      userId: ownerId,
      category: 'owner',
      title: 'Owner application approved',
      body: 'Your owner account is now active. You can submit properties.',
      linkRoute: '/dashboard/owner',
    });
    await this.audit.log({ actor: adminId, action: 'OWNER_APPROVED', entity: 'Owner', entityId: ownerId });
    return owner;
  }

  async rejectOwner(ownerId: string, adminId: string) {
    const owner = await this.prisma.owner.update({
      where: { userId: ownerId },
      data: { status: 'rejected' },
    });
    await this.notifications.create({
      userId: ownerId,
      category: 'owner',
      title: 'Owner application rejected',
      body: 'Your owner application was not approved.',
    });
    await this.audit.log({ actor: adminId, action: 'OWNER_REJECTED', entity: 'Owner', entityId: ownerId });
    return owner;
  }

  async suspendOwner(ownerId: string, adminId: string) {
    const owner = await this.prisma.owner.update({
      where: { userId: ownerId },
      data: { status: 'suspended' },
    });
    await this.audit.log({ actor: adminId, action: 'OWNER_SUSPENDED', entity: 'Owner', entityId: ownerId });
    return owner;
  }

  // ---- Admin management (SRS §44 — Super Admin only) ----
  async listAdmins() {
    return this.prisma.user.findMany({
      where: { role: { in: ['admin', 'super_admin'] } },
      select: { id: true, email: true, displayName: true, role: true, permissions: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAdmin(adminId: string, dto: { email: string; display_name?: string; permissions?: string[] }) {
    const admin = await this.prisma.user.upsert({
      where: { email: dto.email },
      update: { role: 'admin', permissions: dto.permissions ?? [], displayName: dto.display_name ?? undefined },
      create: { email: dto.email, role: 'admin', permissions: dto.permissions ?? [], displayName: dto.display_name ?? null },
    });
    await this.audit.log({ actor: adminId, action: 'ADMIN_CREATED', entity: 'Admin', entityId: admin.id, metadata: { permissions: dto.permissions } });
    return admin;
  }

  async updatePermissions(adminId: string, targetId: string, permissions: string[]) {
    if (permissions.includes('*')) {
      // Promote to Super Admin — only Super Admin can do this.
      return this.prisma.user.update({ where: { id: targetId }, data: { role: 'super_admin', permissions: [] } });
    }
    return this.prisma.user.update({ where: { id: targetId }, data: { permissions } });
  }

  async suspendAdmin(targetId: string, adminId: string) {
    return this.prisma.user.update({ where: { id: targetId }, data: { role: 'visitor', permissions: [] } }).then((u) => {
      this.audit.log({ actor: adminId, action: 'ADMIN_SUSPENDED', entity: 'Admin', entityId: targetId });
      return u;
    });
  }
}
