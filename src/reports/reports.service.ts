import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/** Reports/complaints (SRS §36) and reviews/ratings (SRS §35). */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  create(userId: string, dto: { type: string; property_id?: string; message: string }) {
    return this.prisma.report.create({
      data: { type: dto.type, propertyId: dto.property_id, reporterId: userId, message: dto.message, status: 'open' },
    });
  }

  list(page = 1, pageSize = 20) {
    return this.prisma.$transaction([
      this.prisma.report.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.report.count(),
    ]).then(([items, total]) => ({ items, total, page, page_size: pageSize, has_next: page * pageSize < total }));
  }

  resolve(id: string, adminId: string) {
    return this.prisma.report.update({ where: { id }, data: { status: 'resolved' } }).then((r) => {
      this.audit.log({ actor: adminId, action: 'REPORT_RESOLVED', entity: 'Report', entityId: id });
      return r;
    });
  }
}
