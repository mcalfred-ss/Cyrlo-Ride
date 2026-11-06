import type { PrismaClient } from '@prisma/client';

/** Private to the locations module. Do not import this from another module. */
export class LocationsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  protected database(): PrismaClient {
    return this.prisma;
  }
}
