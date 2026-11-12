import type { Prisma, PrismaClient } from '@prisma/client';

import { AppError } from '../../common/errors/app-error.js';
import { IdempotencyKey } from '../../common/utils/idempotency.js';
import { TOKEN_COST_PER_ACCEPTANCE } from '../../config/constants.js';

/** Private to the wallet module. */
export class WalletRepository {
  constructor(private readonly prisma: PrismaClient) {}

  protected database(): PrismaClient {
    return this.prisma;
  }

  async getBalance(riderId: string) {
    const wallet = await this.prisma.riderWallet.findUnique({ where: { riderId } });
    return wallet?.tokenBalance ?? 0;
  }

  /**
   * Debit one token inside an existing interactive transaction.
   * Locks the wallet row, inserts idempotent ledger DEDUCTION, updates balance.
   */
  async debitForAcceptanceInTx(
    tx: Prisma.TransactionClient,
    input: { riderId: string; bookingId: string },
  ) {
    const key = IdempotencyKey.tokenDebit(input.bookingId);
    const existing = await tx.tokenLedgerEntry.findUnique({ where: { idempotencyKey: key } });
    if (existing) {
      return existing;
    }

    const locked = await tx.$queryRaw<Array<{ rider_id: string; token_balance: number }>>`
      SELECT rider_id, token_balance
      FROM rider_wallets
      WHERE rider_id = ${input.riderId}::uuid
      FOR UPDATE
    `;
    const row = locked[0];
    if (!row) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Rider wallet not found',
      });
    }
    if (row.token_balance < TOKEN_COST_PER_ACCEPTANCE) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Insufficient token balance',
      });
    }
    const balanceAfter = row.token_balance - TOKEN_COST_PER_ACCEPTANCE;
    const entry = await tx.tokenLedgerEntry.create({
      data: {
        riderId: input.riderId,
        bookingId: input.bookingId,
        type: 'DEDUCTION',
        tokenDelta: -TOKEN_COST_PER_ACCEPTANCE,
        balanceAfter,
        idempotencyKey: key,
        reason: 'booking_acceptance',
      },
    });
    await tx.riderWallet.update({
      where: { riderId: input.riderId },
      data: { tokenBalance: balanceAfter },
    });
    return entry;
  }

  /**
   * Compensating token REFUND inside an existing transaction.
   * Original debit stays immutable; new row sets reverses_entry_id.
   */
  async reverseAcceptanceDebitInTx(
    tx: Prisma.TransactionClient,
    input: { riderId: string; bookingId: string; reason: string },
  ) {
    const key = IdempotencyKey.tokenRefund(input.bookingId);
    const existing = await tx.tokenLedgerEntry.findUnique({ where: { idempotencyKey: key } });
    if (existing) {
      return existing;
    }

    const debit = await tx.tokenLedgerEntry.findFirst({
      where: {
        bookingId: input.bookingId,
        riderId: input.riderId,
        type: 'DEDUCTION',
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!debit) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'No token debit found to reverse for this booking',
      });
    }

    const locked = await tx.$queryRaw<Array<{ rider_id: string; token_balance: number }>>`
      SELECT rider_id, token_balance
      FROM rider_wallets
      WHERE rider_id = ${input.riderId}::uuid
      FOR UPDATE
    `;
    const row = locked[0];
    if (!row) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Rider wallet not found',
      });
    }
    const credit = Math.abs(debit.tokenDelta);
    const balanceAfter = row.token_balance + credit;
    const entry = await tx.tokenLedgerEntry.create({
      data: {
        riderId: input.riderId,
        bookingId: input.bookingId,
        type: 'REFUND',
        tokenDelta: credit,
        balanceAfter,
        idempotencyKey: key,
        reason: input.reason,
        reversesEntryId: debit.id,
      },
    });
    await tx.riderWallet.update({
      where: { riderId: input.riderId },
      data: { tokenBalance: balanceAfter },
    });
    return entry;
  }

  /**
   * Credit purchased tokens inside an existing transaction.
   * Key: token-purchase:{paymentId}. Never credits without ledger.
   */
  async creditPurchaseInTx(
    tx: Prisma.TransactionClient,
    input: {
      riderId: string;
      paymentId: string;
      tokenQuantity: number;
      reason?: string;
    },
  ) {
    if (!Number.isInteger(input.tokenQuantity) || input.tokenQuantity <= 0) {
      throw new AppError({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'Token credit quantity must be a positive integer',
      });
    }
    const key = IdempotencyKey.tokenPurchase(input.paymentId);
    const existing = await tx.tokenLedgerEntry.findUnique({ where: { idempotencyKey: key } });
    if (existing) {
      return existing;
    }

    await tx.riderWallet.upsert({
      where: { riderId: input.riderId },
      create: { riderId: input.riderId, tokenBalance: 0 },
      update: {},
    });

    const locked = await tx.$queryRaw<Array<{ rider_id: string; token_balance: number }>>`
      SELECT rider_id, token_balance
      FROM rider_wallets
      WHERE rider_id = ${input.riderId}::uuid
      FOR UPDATE
    `;
    const row = locked[0];
    if (!row) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Rider wallet not found',
      });
    }
    const balanceAfter = row.token_balance + input.tokenQuantity;
    const entry = await tx.tokenLedgerEntry.create({
      data: {
        riderId: input.riderId,
        paymentId: input.paymentId,
        type: 'PURCHASE',
        tokenDelta: input.tokenQuantity,
        balanceAfter,
        idempotencyKey: key,
        reason: input.reason ?? 'token_package_purchase',
      },
    });
    await tx.riderWallet.update({
      where: { riderId: input.riderId },
      data: { tokenBalance: balanceAfter },
    });
    return entry;
  }

  async listLedger(riderId: string, page: number, pageSize: number) {
    const where = { riderId };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.tokenLedgerEntry.count({ where }),
      this.prisma.tokenLedgerEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, items };
  }

  async listLedgersForFinance(input: {
    page: number;
    pageSize: number;
    riderId?: string;
    type?: 'PURCHASE' | 'DEDUCTION' | 'REFUND' | 'ADJUSTMENT';
    from?: Date;
    to?: Date;
  }) {
    const where: Prisma.TokenLedgerEntryWhereInput = {
      ...(input.riderId ? { riderId: input.riderId } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.from || input.to
        ? {
            createdAt: {
              ...(input.from ? { gte: input.from } : {}),
              ...(input.to ? { lte: input.to } : {}),
            },
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.tokenLedgerEntry.count({ where }),
      this.prisma.tokenLedgerEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          riderId: true,
          bookingId: true,
          paymentId: true,
          type: true,
          tokenDelta: true,
          balanceAfter: true,
          reason: true,
          reversesEntryId: true,
          createdAt: true,
          rider: {
            select: {
              fullName: true,
              user: { select: { phoneNumber: true, status: true } },
            },
          },
        },
      }),
    ]);
    return { total, items };
  }

  async listPurchases(riderId: string, page: number, pageSize: number) {
    const where = { riderId };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.tokenPurchase.count({ where }),
      this.prisma.tokenPurchase.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          payment: {
            select: {
              id: true,
              status: true,
              providerReference: true,
              amountPesewas: true,
              currency: true,
            },
          },
        },
      }),
    ]);
    return { total, items };
  }

  async findPurchaseForRider(purchaseId: string, riderId: string) {
    return this.prisma.tokenPurchase.findFirst({
      where: { id: purchaseId, riderId },
      include: {
        payment: {
          select: {
            id: true,
            status: true,
            providerReference: true,
            amountPesewas: true,
            currency: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
  }

  async listActivePackages() {
    return this.prisma.tokenPackage.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
    });
  }

  async listAllPackages() {
    return this.prisma.tokenPackage.findMany({
      orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
    });
  }

  async findActivePackageByCode(code: string) {
    return this.prisma.tokenPackage.findFirst({
      where: { code, isActive: true },
    });
  }

  async findPackageById(id: string) {
    return this.prisma.tokenPackage.findUnique({ where: { id } });
  }

  async findPurchaseByPaymentId(paymentId: string) {
    return this.prisma.tokenPurchase.findUnique({
      where: { paymentId },
    });
  }
}
