import type { PrismaClient } from '@prisma/client';

/** Private to the auth module. Do not import this from another module. */
export class AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  protected database(): PrismaClient {
    return this.prisma;
  }
}
