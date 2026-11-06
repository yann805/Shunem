import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';

/** Visit coordination — enterprise-mediated (SRS §32, §63). */
@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async request(seekerId: string, dto: { property_id: string; preferred_date?: string; preferred_time?: string }) {
    const property = await this.prisma.property.findUnique({ where: { id: dto.property_id }, select: { ownerId: true } });
    if (!property) throw new NotFoundException('Property not found');

    const visit = await this.prisma.visit.create({
      data: {
        propertyId: dto.property_id,
        seekerId,
        ownerId: property.ownerId ?? '',
        scheduledDate: dto.preferred_date ? new Date(dto.preferred_date) : new Date(),
        time: dto.preferred_time,
        status: 'requested',
      },
    });
    await this.notifications.create({
      toRole: 'admin',
      category: 'visit',
      title: 'New visit request',
      body: `A visit was requested for property ${dto.property_id}.`,
      linkRoute: '/visit',
      linkId: visit.id,
    });
    await this.audit.log({ actor: seekerId, action: 'VISIT_REQUESTED', entity: 'Visit', entityId: visit.id });
    return visit;
  }

  async myVisits(seekerId: string) {
    return this.prisma.visit.findMany({ where: { seekerId }, orderBy: { scheduledDate: 'desc' } });
  }

  async getById(id: string) {
    const v = await this.prisma.visit.findUnique({ where: { id } });
    if (!v) throw new NotFoundException('Visit not found');
    return v;
  }

  async schedule(id: string, adminId: string, dto: { date: string; time?: string; coordinator: string }) {
    const v = await this.prisma.visit.update({
      where: { id },
      data: { scheduledDate: new Date(dto.date), time: dto.time, coordinatedBy: dto.coordinator, status: 'confirmed' },
    });
    await this.notifications.create({
      userId: v.seekerId,
      category: 'visit',
      title: 'Visit confirmed',
      body: `Your visit is confirmed for ${dto.date} ${dto.time ?? ''}.`,
      linkRoute: '/visit',
      linkId: v.id,
    });
    await this.audit.log({ actor: adminId, action: 'VISIT_SCHEDULED', entity: 'Visit', entityId: id });
    return v;
  }
}
