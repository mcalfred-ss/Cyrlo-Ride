import type { PrismaClient } from '@prisma/client';

/** Private to the service-zones module. Do not import this from another module. */
export class ServiceZonesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  protected database(): PrismaClient {
    return this.prisma;
  }
}
