import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

/** Reviews & ratings (SRS §35 — only after completed eligible interactions). */
@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: { property_id: string; rating: number; comment?: string }) {
    if (dto.rating < 1 || dto.rating > 5) throw new Error('Rating must be 1–5');
    return this.prisma.review.create({
      data: { propertyId: dto.property_id, userId, rating: dto.rating, comment: dto.comment },
    });
  }

  forProperty(propertyId: string) {
    return this.prisma.review.findMany({ where: { propertyId }, orderBy: { createdAt: 'desc' } });
  }
}
