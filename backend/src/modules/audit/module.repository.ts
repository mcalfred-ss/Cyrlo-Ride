import { Prisma, type PrismaClient } from '@prisma/client';

import type { RecordAuditInput } from './module.schema.js';

/** Private to the audit module. Do not import this from another module. */
export class AuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  protected database(): PrismaClient {
    return this.prisma;
  }

  async create(input: RecordAuditInput): Promise<{ id: string }> {
    return this.prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata:
          input.metadata === undefined
            ? undefined
            : (input.metadata as Prisma.InputJsonValue),
        ipAddress: input.ipAddress,
      },
      select: { id: true },
    });
  }
}
