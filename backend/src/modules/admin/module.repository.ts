import type { PrismaClient } from '@prisma/client';

/** Private to the admin module. Do not import this from another module. */
export class AdminRepository {
  constructor(private readonly prisma: PrismaClient) {}

  protected database(): PrismaClient {
    return this.prisma;
  }
}
