import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../common/prisma/prisma.service';

/**
 * Audit logging (SRS §109). Records actor, action, entity, result, timestamp.
 * Important administrative actions are auditable & protected from modification
 * (append-only — no update/delete endpoints exposed).
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    actor: string;
    action: string;
    entity: string;
    entityId?: string;
    result?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.prisma.auditRecord.create({
        data: {
          actor: params.actor,
          action: params.action,
          entity: params.entity,
          entityId: params.entityId,
          result: params.result ?? 'success',
          metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      // Audit failure must never break the business operation, but is logged.
      new Logger('AuditService').error(`Audit write failed: ${String(err)}`);
    }
  }
}
