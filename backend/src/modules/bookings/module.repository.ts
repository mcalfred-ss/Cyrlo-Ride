import type { PrismaClient } from '@prisma/client';

/** Private to the bookings module. Do not import this from another module. */
export class BookingsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  protected database(): PrismaClient {
    return this.prisma;
  }
}
