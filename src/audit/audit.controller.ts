import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../common/prisma/prisma.service';
import { Permissions } from '../common/decorators/auth.decorators';
import { PaginationDto, Paginated, paginate } from '../common/dto/pagination.dto';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  /** List audit records (SRS §109 — AUDIT_VIEW permission, admins only). */
  @Get()
  @Permissions('AUDIT_VIEW')
  async list(@Query() q: PaginationDto): Promise<Paginated<unknown>> {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditRecord.findMany({
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditRecord.count(),
    ]);
    return paginate(items, total, page, pageSize);
  }
}
