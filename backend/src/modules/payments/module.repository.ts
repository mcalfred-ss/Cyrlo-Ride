import type { PrismaClient } from '@prisma/client';

/** Private to the payments module. Do not import this from another module. */
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  protected database(): PrismaClient {
    return this.prisma;
  }
}
