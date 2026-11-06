import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/** Versioned Owner Terms (SRS §11, §50). */
@Injectable()
export class TermsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Active terms (public — shown to owners during registration). */
  async active() {
    return this.prisma.ownerTerms.findFirst({
      where: { status: 'active' },
      orderBy: { publishedAt: 'desc' },
    });
  }

  /** All versions (admin only). */
  async list() {
    return this.prisma.ownerTerms.findMany({ orderBy: { publishedAt: 'desc' } });
  }

  /** Publish a new version (Super Admin only, SRS §50). */
  async publish(adminId: string, dto: { version: string; sections: unknown[]; mandatory?: boolean }) {
    // Archive previous active versions.
    await this.prisma.ownerTerms.updateMany({
      where: { status: 'active' },
      data: { status: 'archived' },
    });
    const terms = await this.prisma.ownerTerms.create({
      data: {
        version: dto.version,
        sections: dto.sections as never,
        mandatory: dto.mandatory ?? true,
        status: 'active',
      },
    });
    await this.audit.log({ actor: adminId, action: 'TERMS_PUBLISHED', entity: 'OwnerTerms', entityId: dto.version });
    return terms;
  }
}
