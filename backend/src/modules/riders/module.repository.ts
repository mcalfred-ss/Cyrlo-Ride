import type { PrismaClient } from '@prisma/client';

/** Private to the riders module. Do not import this from another module. */
export class RidersRepository {
  constructor(private readonly prisma: PrismaClient) {}

  protected database(): PrismaClient {
    return this.prisma;
  }
}
