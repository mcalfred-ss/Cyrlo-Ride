import type { PrismaClient } from '@prisma/client';

export interface ModuleDeps {
  prisma: PrismaClient;
}
