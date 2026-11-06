import { Injectable } from '@nestjs/common';
import { NotificationCategory, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

/**
 * Notification service (SRS §37, §101, §102, §104).
 *
 * Notifications are PERSISTED before/as part of the business operation so a
 * push delivery failure never loses history (SRS §102). Supabase Realtime
 * streams the DB insert to the Flutter app; FCM push is triggered separately.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: {
    userId?: string;
    toRole?: string;
    category?: NotificationCategory;
    title: string;
    body: string;
    linkRoute?: string;
    linkId?: string;
    params?: Record<string, unknown>;
  }) {
    return this.prisma.notification.create({
      data: {
        userId: params.userId,
        toRole: params.toRole ? (params.toRole as UserRole) : undefined,
        category: params.category ?? 'system',
        title: params.title,
        body: params.body,
        linkRoute: params.linkRoute,
        linkId: params.linkId,
        params: (params.params ?? {}) as Prisma.InputJsonValue,
      },
    });
    // FCM push + Supabase Realtime delivery handled out-of-band (SRS §101).
  }

  async list(userId: string, page = 1, pageSize = 50) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);
    return { items, total, page, page_size: pageSize, has_next: page * pageSize < total };
  }

  markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
  }

  markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }
}
