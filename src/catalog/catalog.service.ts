import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

/** Enterprise-configured catalog (SRS §13, §14, §19, §49). */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  categories() {
    return this.prisma.category.findMany({ orderBy: { id: 'asc' } });
  }
  amenities() {
    return this.prisma.amenity.findMany({ orderBy: { id: 'asc' } });
  }
  transactionTypes() {
    return this.prisma.transactionTypeConfig.findMany({ orderBy: { id: 'asc' } });
  }
}
