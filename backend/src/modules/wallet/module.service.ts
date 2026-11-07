import { randomUUID } from 'node:crypto';

import { AppError } from '../../common/errors/app-error.js';
import { IdempotencyKey } from '../../common/utils/idempotency.js';
import { enqueueInAppNotification } from '../../infrastructure/notifications/notify.js';
import {
  createPaystackClient,
  riderPaymentEmail,
  type PaystackClient,
} from '../../infrastructure/payments/paystack-client.js';
import type { AuditService } from '../audit/module.service.js';
import type {
  CreatePackageInput,
  ListPageQuery,
  PurchasePackageInput,
  UpdatePackageInput,
} from './module.schema.js';
import type { WalletRepository } from './module.repository.js';
import type { PrismaClient } from '@prisma/client';

export interface WalletServiceDeps {
  audit: AuditService;
  prisma: PrismaClient;
  paystack?: PaystackClient;
  now?: () => Date;
}

export interface WalletService {
  listActivePackages(): Promise<unknown>;
  getBalance(riderId: string): Promise<unknown>;
  listLedger(riderId: string, query: ListPageQuery): Promise<unknown>;
  listPurchases(riderId: string, query: ListPageQuery): Promise<unknown>;
  getPurchase(riderId: string, purchaseId: string): Promise<unknown>;
  initiatePurchase(riderId: string, input: PurchasePackageInput, ip?: string): Promise<unknown>;
  /** Called from verified Paystack webhook after payment SUCCESS for TOKEN_PURCHASE. */
  fulfillPaidPurchase(paymentId: string): Promise<void>;
  markPurchaseFailed(paymentId: string): Promise<void>;
  listPackagesForFinance(): Promise<unknown>;
  createPackage(actorId: string, input: CreatePackageInput, ip?: string): Promise<unknown>;
  updatePackage(
    actorId: string,
    packageId: string,
    input: UpdatePackageInput,
    ip?: string,
  ): Promise<unknown>;
  listPurchasesForFinance(query: ListPageQuery & { status?: string }): Promise<unknown>;
}

export class WalletServiceImpl implements WalletService {
  private readonly now: () => Date;
  private readonly paystack: PaystackClient;

  constructor(
    private readonly repository: WalletRepository,
    private readonly deps: WalletServiceDeps,
  ) {
    this.now = deps.now ?? (() => new Date());
    this.paystack = deps.paystack ?? createPaystackClient();
  }

  async listActivePackages() {
    const rows = await this.repository.listActivePackages();
    return rows.map(toPackageView);
  }

  async getBalance(riderId: string) {
    await this.requireRider(riderId);
    const balance = await this.repository.getBalance(riderId);
    return { riderId, tokenBalance: balance };
  }

  async listLedger(riderId: string, query: ListPageQuery) {
    await this.requireRider(riderId);
    const { total, items } = await this.repository.listLedger(riderId, query.page, query.pageSize);
    return {
      items: items.map((row) => ({
        id: row.id,
        type: row.type,
        tokenDelta: row.tokenDelta,
        balanceAfter: row.balanceAfter,
        reason: row.reason,
        bookingId: row.bookingId,
        paymentId: row.paymentId,
        reversesEntryId: row.reversesEntryId,
        createdAt: row.createdAt.toISOString(),
        kind: classifyLedgerKind(row.type, row.reason),
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        hasNextPage: query.page * query.pageSize < total,
      },
    };
  }

  async listPurchases(riderId: string, query: ListPageQuery) {
    await this.requireRider(riderId);
    const { total, items } = await this.repository.listPurchases(
      riderId,
      query.page,
      query.pageSize,
    );
    return {
      items: items.map(toPurchaseView),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        hasNextPage: query.page * query.pageSize < total,
      },
    };
  }

  async getPurchase(riderId: string, purchaseId: string) {
    await this.requireRider(riderId);
    const purchase = await this.repository.findPurchaseForRider(purchaseId, riderId);
    if (!purchase) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Purchase not found' });
    }
    return toPurchaseView(purchase);
  }

  async initiatePurchase(riderId: string, input: PurchasePackageInput, ip?: string) {
    await this.requireRider(riderId);
    const pkg = await this.repository.findActivePackageByCode(input.packageCode);
    if (!pkg) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Token package is not available',
      });
    }
    if (pkg.pricePesewas <= 0 || pkg.tokenQuantity <= 0) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Token package configuration is invalid',
      });
    }

    const idempotencyKey = input.clientRequestId
      ? IdempotencyKey.tokenPurchaseInit(riderId, input.clientRequestId)
      : `token-purchase-init:${riderId}:${randomUUID()}`;

    const existingPayment = await this.deps.prisma.payment.findUnique({
      where: { idempotencyKey },
      include: { tokenPurchase: true },
    });
    if (existingPayment?.tokenPurchase) {
      if (existingPayment.userId !== riderId) {
        throw new AppError({ status: 409, code: 'CONFLICT', message: 'Idempotency key conflict' });
      }
      return this.resumePurchaseCheckout(existingPayment.id, existingPayment.tokenPurchase.id);
    }

    const paymentId = randomUUID();
    const purchaseId = randomUUID();
    const reference = `tp_${paymentId.replace(/-/g, '')}`;

    try {
      await this.deps.prisma.$transaction(async (tx) => {
        await tx.riderWallet.upsert({
          where: { riderId },
          create: { riderId, tokenBalance: 0 },
          update: {},
        });
        await tx.payment.create({
          data: {
            id: paymentId,
            userId: riderId,
            purpose: 'TOKEN_PURCHASE',
            amountPesewas: pkg.pricePesewas,
            currency: pkg.currency,
            status: 'PENDING',
            provider: 'paystack',
            providerReference: reference,
            idempotencyKey,
          },
        });
        await tx.tokenPurchase.create({
          data: {
            id: purchaseId,
            riderId,
            packageId: pkg.id,
            paymentId,
            packageCode: pkg.code,
            packageName: pkg.name,
            tokenQuantity: pkg.tokenQuantity,
            pricePesewas: pkg.pricePesewas,
            currency: pkg.currency,
            status: 'PENDING',
          },
        });
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        const raced = await this.deps.prisma.payment.findUnique({
          where: { idempotencyKey },
          include: { tokenPurchase: true },
        });
        if (raced?.tokenPurchase && raced.userId === riderId) {
          return this.resumePurchaseCheckout(raced.id, raced.tokenPurchase.id);
        }
      }
      throw error;
    }

    const init = await this.paystack.initializeTransaction({
      email: riderPaymentEmail(riderId),
      amountPesewas: pkg.pricePesewas,
      currency: pkg.currency,
      reference,
      metadata: {
        paymentId,
        purchaseId,
        purpose: 'TOKEN_PURCHASE',
        riderId,
        packageCode: pkg.code,
      },
    });

    await this.deps.audit.record({
      actorId: riderId,
      action: 'wallet.purchase.initialized',
      entityType: 'token_purchase',
      entityId: purchaseId,
      metadata: {
        packageCode: pkg.code,
        pricePesewas: pkg.pricePesewas,
        tokenQuantity: pkg.tokenQuantity,
        paymentId,
      },
      ipAddress: ip,
    });

    enqueueInAppNotification(this.deps.prisma, {
      userId: riderId,
      title: 'Token purchase started',
      body: `Complete payment for ${pkg.name} (${pkg.tokenQuantity} tokens).`,
      data: { purchaseId, paymentId, status: 'PENDING' },
    });

    return {
      purchaseId,
      paymentId,
      packageCode: pkg.code,
      packageName: pkg.name,
      tokenQuantity: pkg.tokenQuantity,
      amountPesewas: pkg.pricePesewas,
      currency: pkg.currency,
      status: 'PENDING',
      reference: init.reference,
      authorizationUrl: init.authorizationUrl,
      accessCode: init.accessCode,
    };
  }

  async fulfillPaidPurchase(paymentId: string): Promise<void> {
    const now = this.now();
    const result = await this.deps.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!payment || payment.purpose !== 'TOKEN_PURCHASE') {
        throw new AppError({
          status: 409,
          code: 'CONFLICT',
          message: 'Payment is not a token purchase',
        });
      }
      if (payment.status !== 'SUCCESS') {
        throw new AppError({
          status: 409,
          code: 'CONFLICT',
          message: 'Token purchase payment is not successful',
        });
      }
      const purchase = await tx.tokenPurchase.findUnique({ where: { paymentId } });
      if (!purchase) {
        throw new AppError({
          status: 404,
          code: 'NOT_FOUND',
          message: 'Token purchase not found for payment',
        });
      }
      if (purchase.riderId !== payment.userId) {
        throw new AppError({
          status: 409,
          code: 'CONFLICT',
          message: 'Purchase ownership does not match payment',
        });
      }
      if (purchase.pricePesewas !== payment.amountPesewas) {
        throw new AppError({
          status: 409,
          code: 'CONFLICT',
          message: 'Purchase snapshot amount does not match payment',
        });
      }

      const entry = await this.repository.creditPurchaseInTx(tx, {
        riderId: purchase.riderId,
        paymentId,
        tokenQuantity: purchase.tokenQuantity,
        reason: `token_package:${purchase.packageCode}`,
      });

      if (purchase.status !== 'PAID') {
        await tx.tokenPurchase.update({
          where: { id: purchase.id },
          data: { status: 'PAID', paidAt: purchase.paidAt ?? now },
        });
      }

      return { purchase, entry, alreadyPaid: purchase.status === 'PAID' };
    });

    if (!result.alreadyPaid) {
      await this.deps.audit.record({
        action: 'wallet.purchase.paid',
        entityType: 'token_purchase',
        entityId: result.purchase.id,
        metadata: {
          paymentId,
          tokenQuantity: result.purchase.tokenQuantity,
          ledgerEntryId: result.entry.id,
        },
      });
      enqueueInAppNotification(this.deps.prisma, {
        userId: result.purchase.riderId,
        title: 'Token purchase successful',
        body: `${result.purchase.tokenQuantity} tokens were added to your wallet.`,
        data: {
          purchaseId: result.purchase.id,
          paymentId,
          status: 'PAID',
          tokenBalanceAfter: result.entry.balanceAfter,
        },
      });
      enqueueInAppNotification(this.deps.prisma, {
        userId: result.purchase.riderId,
        title: 'Tokens credited',
        body: `Your token balance is now ${result.entry.balanceAfter}.`,
        data: {
          purchaseId: result.purchase.id,
          ledgerEntryId: result.entry.id,
          tokenDelta: result.entry.tokenDelta,
        },
      });
    }
  }

  async markPurchaseFailed(paymentId: string): Promise<void> {
    const purchase = await this.repository.findPurchaseByPaymentId(paymentId);
    if (!purchase || purchase.status === 'PAID') return;
    await this.deps.prisma.tokenPurchase.updateMany({
      where: { paymentId, status: 'PENDING' },
      data: { status: 'FAILED' },
    });
    enqueueInAppNotification(this.deps.prisma, {
      userId: purchase.riderId,
      title: 'Token purchase failed',
      body: 'The token package payment failed. No tokens were credited.',
      data: { purchaseId: purchase.id, paymentId, status: 'FAILED' },
    });
  }

  async listPackagesForFinance() {
    return (await this.repository.listAllPackages()).map(toPackageView);
  }

  async createPackage(actorId: string, input: CreatePackageInput, ip?: string) {
    try {
      const row = await this.deps.prisma.tokenPackage.create({
        data: {
          code: input.code,
          name: input.name,
          tokenQuantity: input.tokenQuantity,
          pricePesewas: input.pricePesewas,
          currency: input.currency,
          isActive: input.isActive,
          displayOrder: input.displayOrder,
        },
      });
      await this.deps.audit.record({
        actorId,
        action: 'wallet.package.created',
        entityType: 'token_package',
        entityId: row.id,
        metadata: {
          code: row.code,
          tokenQuantity: row.tokenQuantity,
          pricePesewas: row.pricePesewas,
          isActive: row.isActive,
        },
        ipAddress: ip,
      });
      return toPackageView(row);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new AppError({
          status: 409,
          code: 'CONFLICT',
          message: 'Package code already exists',
        });
      }
      throw error;
    }
  }

  async updatePackage(
    actorId: string,
    packageId: string,
    input: UpdatePackageInput,
    ip?: string,
  ) {
    const existing = await this.repository.findPackageById(packageId);
    if (!existing) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Package not found' });
    }
    const row = await this.deps.prisma.tokenPackage.update({
      where: { id: packageId },
      data: {
        name: input.name,
        tokenQuantity: input.tokenQuantity,
        pricePesewas: input.pricePesewas,
        isActive: input.isActive,
        displayOrder: input.displayOrder,
      },
    });
    await this.deps.audit.record({
      actorId,
      action: 'wallet.package.updated',
      entityType: 'token_package',
      entityId: packageId,
      metadata: {
        before: {
          name: existing.name,
          tokenQuantity: existing.tokenQuantity,
          pricePesewas: existing.pricePesewas,
          isActive: existing.isActive,
          displayOrder: existing.displayOrder,
        },
        after: {
          name: row.name,
          tokenQuantity: row.tokenQuantity,
          pricePesewas: row.pricePesewas,
          isActive: row.isActive,
          displayOrder: row.displayOrder,
        },
      },
      ipAddress: ip,
    });
    return toPackageView(row);
  }

  async listPurchasesForFinance(query: ListPageQuery & { status?: string }) {
    const where = query.status
      ? { status: query.status as 'PENDING' | 'PAID' | 'FAILED' | 'ABANDONED' }
      : {};
    const [total, items] = await this.deps.prisma.$transaction([
      this.deps.prisma.tokenPurchase.count({ where }),
      this.deps.prisma.tokenPurchase.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
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
    return {
      items: items.map(toPurchaseView),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        hasNextPage: query.page * query.pageSize < total,
      },
    };
  }

  private async resumePurchaseCheckout(paymentId: string, purchaseId: string) {
    const payment = await this.deps.prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { tokenPurchase: true },
    });
    const purchase = payment.tokenPurchase!;
    if (payment.status === 'SUCCESS' && purchase.status === 'PAID') {
      return {
        purchaseId: purchase.id,
        paymentId: payment.id,
        packageCode: purchase.packageCode,
        packageName: purchase.packageName,
        tokenQuantity: purchase.tokenQuantity,
        amountPesewas: purchase.pricePesewas,
        currency: purchase.currency,
        status: 'PAID',
        reference: payment.providerReference,
      };
    }
    const reference = payment.providerReference ?? `tp_${payment.id.replace(/-/g, '')}`;
    const init = await this.paystack.initializeTransaction({
      email: riderPaymentEmail(payment.userId),
      amountPesewas: purchase.pricePesewas,
      currency: purchase.currency,
      reference,
      metadata: {
        paymentId: payment.id,
        purchaseId: purchase.id,
        purpose: 'TOKEN_PURCHASE',
        riderId: purchase.riderId,
        packageCode: purchase.packageCode,
      },
    });
    return {
      purchaseId: purchase.id,
      paymentId: payment.id,
      packageCode: purchase.packageCode,
      packageName: purchase.packageName,
      tokenQuantity: purchase.tokenQuantity,
      amountPesewas: purchase.pricePesewas,
      currency: purchase.currency,
      status: purchase.status,
      reference: init.reference,
      authorizationUrl: init.authorizationUrl,
      accessCode: init.accessCode,
    };
  }

  private async requireRider(riderId: string) {
    const user = await this.deps.prisma.user.findUnique({
      where: { id: riderId },
      select: { role: true, status: true, riderProfile: { select: { userId: true } } },
    });
    if (!user || user.role !== 'RIDER' || !user.riderProfile) {
      throw new AppError({ status: 403, code: 'FORBIDDEN', message: 'Rider access required' });
    }
    if (user.status === 'SUSPENDED' || user.status === 'DELETED') {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Account is not active',
      });
    }
  }
}

function toPackageView(row: {
  id: string;
  code: string;
  name: string;
  tokenQuantity: number;
  pricePesewas: number;
  currency: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    tokenQuantity: row.tokenQuantity,
    pricePesewas: row.pricePesewas,
    currency: row.currency,
    isActive: row.isActive,
    displayOrder: row.displayOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPurchaseView(row: {
  id: string;
  riderId: string;
  packageId: string;
  paymentId: string;
  packageCode: string;
  packageName: string;
  tokenQuantity: number;
  pricePesewas: number;
  currency: string;
  status: string;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  payment?: {
    id: string;
    status: string;
    providerReference: string | null;
    amountPesewas: number;
    currency: string;
  } | null;
}) {
  return {
    id: row.id,
    riderId: row.riderId,
    packageId: row.packageId,
    paymentId: row.paymentId,
    packageCode: row.packageCode,
    packageName: row.packageName,
    tokenQuantity: row.tokenQuantity,
    pricePesewas: row.pricePesewas,
    currency: row.currency,
    status: row.status,
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    payment: row.payment
      ? {
          id: row.payment.id,
          status: row.payment.status,
          providerReference: row.payment.providerReference,
          amountPesewas: row.payment.amountPesewas,
          currency: row.payment.currency,
        }
      : null,
  };
}

function classifyLedgerKind(type: string, reason: string): string {
  if (type === 'PURCHASE') return 'TOKEN_PURCHASE_CREDIT';
  if (type === 'DEDUCTION') return 'MATCHING_TOKEN_DEBIT';
  if (type === 'REFUND') return 'RIDER_CANCELLATION_REVERSAL';
  if (type === 'ADJUSTMENT') return 'ADJUSTMENT';
  return reason;
}
