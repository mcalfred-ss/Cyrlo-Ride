import type { PrismaClient } from '@prisma/client';

/** Private to the matching module. Do not import this from another module. */
export class MatchingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  protected database(): PrismaClient {
    return this.prisma;
  }
}
