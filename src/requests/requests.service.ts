import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';

/** Interest requests — enterprise-mediated (SRS §30, §31). */
@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async create(seekerId: string, dto: { property_id: string; message?: string; preferred_date?: string; preferred_time?: string }) {
    const request = await this.prisma.interestRequest.create({
      data: {
        propertyId: dto.property_id,
        seekerId,
        message: dto.message,
        preferredDate: dto.preferred_date ? new Date(dto.preferred_date) : null,
        preferredTime: dto.preferred_time,
        status: 'submitted',
      },
    });

    // Persist notification BEFORE returning (SRS §102). Notify admins of the
    // new request; the seeker/owner never contact each other directly (SRS §30).
    await this.notifications.create({
      toRole: 'admin',
      category: 'message',
      title: 'New property interest request',
      body: `A seeker requested info about property ${dto.property_id}.`,
      linkRoute: '/request',
      linkId: request.id,
    });
    await this.audit.log({ actor: seekerId, action: 'REQUEST_CREATED', entity: 'InterestRequest', entityId: request.id });
    return request;
  }

  async myRequests(seekerId: string) {
    return this.prisma.interestRequest.findMany({
      where: { seekerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(id: string) {
    const r = await this.prisma.interestRequest.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Request not found');
    return r;
  }

  /** Admin advances the mediation status (SRS §30). */
  async advance(id: string, adminId: string, status: string) {
    const r = await this.prisma.interestRequest.update({
      where: { id },
      data: { status: status as never, coordinatorId: adminId },
    });
    await this.notifications.create({
      userId: r.seekerId,
      category: 'visit',
      title: 'Request status updated',
      body: `Your request is now: ${status}.`,
      linkRoute: '/request',
      linkId: r.id,
    });
    await this.audit.log({ actor: adminId, action: 'REQUEST_ADVANCED', entity: 'InterestRequest', entityId: id, metadata: { status } });
    return r;
  }
}
