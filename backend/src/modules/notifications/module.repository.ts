import type { PrismaClient } from '@prisma/client';

/** Private to the notifications module. Do not import this from another module. */
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  protected database(): PrismaClient {
    return this.prisma;
  }
}
