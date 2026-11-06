import type { PrismaClient } from '@prisma/client';

/** Private to the users module. Do not import this from another module. */
export class UsersRepository {
  constructor(private readonly prisma: PrismaClient) {}

  protected database(): PrismaClient {
    return this.prisma;
  }
}
