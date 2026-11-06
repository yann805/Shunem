import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { ConfigService } from '@nestjs/config';

/** Booking management (SRS §33, §64). Enterprise-mediated. */
@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async create(seekerId: string, dto: { property_id: string; start_date: string; end_date: string; occupants?: number }) {
    const property = await this.prisma.property.findUnique({ where: { id: dto.property_id } });
    if (!property) throw new NotFoundException('Property not found');
    if (!['published', 'available'].includes(property.status)) {
      throw new BadRequestException('Property is not available for booking');
    }

    const start = new Date(dto.start_date);
    const end = new Date(dto.end_date);
    const nights = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
    const feePct = Number(this.config.get<string>('SERVICE_FEE_PERCENT') ?? '3');
    const fees = Number(property.price) * nights * (feePct / 100);
    const total = Number(property.price) * nights + fees;

    // Concurrency control (SRS §90) — prevent double-booking via a status check.
    const overlapping = await this.prisma.booking.findFirst({
      where: {
        propertyId: dto.property_id,
        status: { in: ['confirmed', 'requested', 'under_review'] },
        OR: [{ startDate: { lte: end } }, { endDate: { gte: start } }],
      },
    });
    if (overlapping) {
      throw new BadRequestException('Property is already booked for these dates');
    }

    const booking = await this.prisma.booking.create({
      data: {
        propertyId: dto.property_id,
        seekerId,
        ownerId: property.ownerId ?? '',
        startDate: start,
        endDate: end,
        occupants: dto.occupants ?? 1,
        nights,
        price: property.price,
        fees,
        total,
        status: 'requested',
      },
    });

    await this.notifications.create({
      toRole: 'admin',
      category: 'booking',
      title: 'New booking request',
      body: `A booking was requested for property ${dto.property_id}.`,
      linkRoute: '/booking',
      linkId: booking.id,
    });
    await this.audit.log({ actor: seekerId, action: 'BOOKING_CREATED', entity: 'Booking', entityId: booking.id });
    return booking;
  }

  async myBookings(seekerId: string) {
    return this.prisma.booking.findMany({ where: { seekerId }, orderBy: { createdAt: 'desc' }, include: { payments: true } });
  }

  async getById(id: string) {
    const b = await this.prisma.booking.findUnique({ where: { id }, include: { payments: true } });
    if (!b) throw new NotFoundException('Booking not found');
    return b;
  }

  async confirm(id: string, adminId: string) {
    const b = await this.prisma.booking.update({ where: { id }, data: { status: 'confirmed' } });
    await this.notifications.create({
      userId: b.seekerId,
      category: 'booking',
      title: 'Booking confirmed',
      body: `Your booking ${id} is confirmed. Proceed to payment.`,
      linkRoute: '/payment',
      linkId: b.id,
    });
    await this.audit.log({ actor: adminId, action: 'BOOKING_CONFIRMED', entity: 'Booking', entityId: id });
    return b;
  }
}
