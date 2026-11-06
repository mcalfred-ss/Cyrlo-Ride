import type { PrismaClient } from '@prisma/client';

/** Private to the audit module. Do not import this from another module. */
export class AuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  protected database(): PrismaClient {
    return this.prisma;
  }
}
