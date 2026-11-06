import type { PrismaClient } from '@prisma/client';

/** Private to the wallet module. Do not import this from another module. */
export class WalletRepository {
  constructor(private readonly prisma: PrismaClient) {}

  protected database(): PrismaClient {
    return this.prisma;
  }
}
