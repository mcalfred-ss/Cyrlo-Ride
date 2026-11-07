import { createHmac, randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { env } from '../../config/env.js';
import { MemoryAuditService } from '../audit/module.service.js';
import { BookingsRepository } from '../bookings/module.repository.js';
import { BookingsServiceImpl } from '../bookings/module.service.js';
import { MemoryPaystackClient } from '../../infrastructure/payments/paystack-client.js';
import { PaymentsRepository } from '../payments/module.repository.js';
import { PaymentsServiceImpl } from '../payments/module.service.js';
import { WalletRepository } from './module.repository.js';
import { WalletServiceImpl } from './module.service.js';

const prisma = new PrismaClient();
const marker = `m9-${Date.now()}`;
const userIds: string[] = [];
const packageIds: string[] = [];

function sign(body: Buffer) {
  return createHmac('sha512', env.PAYSTACK_SECRET_KEY).update(body).digest('hex');
}

describe('token package purchases postgres', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    const purchases = await prisma.tokenPurchase.findMany({
      where: { riderId: { in: userIds } },
      select: { id: true, paymentId: true },
    });
    const paymentIds = purchases.map((p) => p.paymentId);
    await prisma.tokenLedgerEntry.deleteMany({
      where: { OR: [{ riderId: { in: userIds } }, { paymentId: { in: paymentIds } }] },
    });
    await prisma.tokenPurchase.deleteMany({ where: { riderId: { in: userIds } } });
    await prisma.paymentWebhookEvent.deleteMany({
      where: { providerReference: { startsWith: 'tp_' } },
    });
    await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    await prisma.riderWallet.deleteMany({ where: { riderId: { in: userIds } } });
    await prisma.riderProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    if (packageIds.length) {
      await prisma.tokenPackage.deleteMany({ where: { id: { in: packageIds } } });
    }
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  async function seedRider() {
    const rider = await prisma.user.create({
      data: {
        phoneNumber: `+23360${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'RIDER',
        status: 'ACTIVE',
        riderProfile: {
          create: {
            fullName: `${marker} Rider`,
            verificationStatus: 'APPROVED',
            availability: 'OFFLINE',
            wallet: { create: { tokenBalance: 0 } },
          },
        },
      },
    });
    userIds.push(rider.id);
    return rider;
  }

  function services() {
    const audit = new MemoryAuditService();
    const paystack = new MemoryPaystackClient();
    const wallet = new WalletServiceImpl(new WalletRepository(prisma), {
      audit,
      prisma,
      paystack,
    });
    const bookings = new BookingsServiceImpl(new BookingsRepository(prisma), {
      audit,
      prisma,
      paystack,
    });
    const payments = new PaymentsServiceImpl(new PaymentsRepository(prisma), {
      audit,
      prisma,
      bookings,
      wallet,
      paystack,
    });
    return { wallet, payments, paystack, audit };
  }

  it('seeds initial packages and preserves snapshots when package price changes', async () => {
    const starter = await prisma.tokenPackage.findUniqueOrThrow({ where: { code: 'STARTER' } });
    expect(starter.tokenQuantity).toBe(20);
    expect(starter.pricePesewas).toBe(1000);

    const pack = await prisma.tokenPackage.create({
      data: {
        code: `SNAP_${Date.now()}`,
        name: 'Snapshot Pack',
        tokenQuantity: 20,
        pricePesewas: 1000,
        isActive: true,
        displayOrder: 50,
      },
    });
    packageIds.push(pack.id);

    const rider = await seedRider();
    const { wallet, payments } = services();
    const init = (await wallet.initiatePurchase(rider.id, {
      packageCode: pack.code,
      clientRequestId: `req-${randomUUID()}`,
    })) as { purchaseId: string; paymentId: string; reference: string; amountPesewas: number };

    expect(init.amountPesewas).toBe(1000);

    await wallet.updatePackage(rider.id, pack.id, { pricePesewas: 1200 });
    const purchase = await prisma.tokenPurchase.findUniqueOrThrow({
      where: { id: init.purchaseId },
    });
    expect(purchase.pricePesewas).toBe(1000);

    const body = Buffer.from(
      JSON.stringify({
        event: 'charge.success',
        data: {
          id: randomUUID(),
          reference: init.reference,
          amount: 1000,
          currency: 'GHS',
          status: 'success',
          metadata: { paymentId: init.paymentId, purpose: 'TOKEN_PURCHASE', riderId: rider.id },
        },
      }),
    );
    await payments.handlePaystackWebhook({ rawBody: body, signature: sign(body) });

    const paid = await prisma.tokenPurchase.findUniqueOrThrow({ where: { id: init.purchaseId } });
    expect(paid.status).toBe('PAID');
    expect(paid.tokenQuantity).toBe(20);
    const balance = await prisma.riderWallet.findUniqueOrThrow({ where: { riderId: rider.id } });
    expect(balance.tokenBalance).toBe(20);
    const credits = await prisma.tokenLedgerEntry.findMany({
      where: { paymentId: init.paymentId, type: 'PURCHASE' },
    });
    expect(credits).toHaveLength(1);
    expect(credits[0]?.tokenDelta).toBe(20);

    // Duplicate webhook is idempotent.
    const body2 = Buffer.from(
      JSON.stringify({
        event: 'charge.success',
        data: {
          id: randomUUID(),
          reference: init.reference,
          amount: 1000,
          currency: 'GHS',
          status: 'success',
          metadata: { paymentId: init.paymentId, purpose: 'TOKEN_PURCHASE', riderId: rider.id },
        },
      }),
    );
    await payments.handlePaystackWebhook({ rawBody: body2, signature: sign(body2) });
    expect(
      await prisma.tokenLedgerEntry.count({
        where: { paymentId: init.paymentId, type: 'PURCHASE' },
      }),
    ).toBe(1);
    expect(
      (await prisma.riderWallet.findUniqueOrThrow({ where: { riderId: rider.id } })).tokenBalance,
    ).toBe(20);
  });

  it('rejects bad webhook amounts, disabled packages, and passenger purchases', async () => {
    const rider = await seedRider();
    const passenger = await prisma.user.create({
      data: {
        phoneNumber: `+23361${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'PASSENGER',
        status: 'ACTIVE',
      },
    });
    userIds.push(passenger.id);
    const { wallet, payments } = services();

    await expect(wallet.initiatePurchase(passenger.id, { packageCode: 'STARTER' })).rejects.toMatchObject(
      { status: 403 },
    );

    const disabled = await prisma.tokenPackage.create({
      data: {
        code: `OFF_${Date.now()}`,
        name: 'Disabled',
        tokenQuantity: 5,
        pricePesewas: 500,
        isActive: false,
        displayOrder: 99,
      },
    });
    packageIds.push(disabled.id);
    await expect(
      wallet.initiatePurchase(rider.id, { packageCode: disabled.code }),
    ).rejects.toMatchObject({ status: 404 });

    const init = (await wallet.initiatePurchase(rider.id, {
      packageCode: 'STANDARD',
      clientRequestId: `req-${randomUUID()}`,
    })) as { reference: string; paymentId: string; amountPesewas: number };

    const badAmount = Buffer.from(
      JSON.stringify({
        event: 'charge.success',
        data: {
          id: randomUUID(),
          reference: init.reference,
          amount: 1,
          currency: 'GHS',
          status: 'success',
          metadata: { paymentId: init.paymentId, purpose: 'TOKEN_PURCHASE', riderId: rider.id },
        },
      }),
    );
    await expect(
      payments.handlePaystackWebhook({ rawBody: badAmount, signature: sign(badAmount) }),
    ).rejects.toMatchObject({ message: /amount or currency/ });

    const badSig = Buffer.from(
      JSON.stringify({
        event: 'charge.success',
        data: { id: randomUUID(), reference: init.reference, amount: init.amountPesewas, currency: 'GHS' },
      }),
    );
    await expect(
      payments.handlePaystackWebhook({ rawBody: badSig, signature: 'deadbeef' }),
    ).rejects.toMatchObject({ status: 401 });

    const failed = Buffer.from(
      JSON.stringify({
        event: 'charge.failed',
        data: { id: randomUUID(), reference: init.reference, amount: init.amountPesewas, currency: 'GHS' },
      }),
    );
    await payments.handlePaystackWebhook({ rawBody: failed, signature: sign(failed) });
    expect(
      (await prisma.tokenPurchase.findFirstOrThrow({ where: { paymentId: init.paymentId } })).status,
    ).toBe('FAILED');
    expect(
      await prisma.tokenLedgerEntry.count({ where: { paymentId: init.paymentId, type: 'PURCHASE' } }),
    ).toBe(0);
  });

  it('handles concurrent successful webhooks without double credit', async () => {
    const rider = await seedRider();
    const { wallet, payments } = services();
    const init = (await wallet.initiatePurchase(rider.id, {
      packageCode: 'PRO',
      clientRequestId: `req-${randomUUID()}`,
    })) as { reference: string; paymentId: string; amountPesewas: number };

    const makeBody = (eventId: string) =>
      Buffer.from(
        JSON.stringify({
          event: 'charge.success',
          data: {
            id: eventId,
            reference: init.reference,
            amount: init.amountPesewas,
            currency: 'GHS',
            status: 'success',
            metadata: { paymentId: init.paymentId, purpose: 'TOKEN_PURCHASE', riderId: rider.id },
          },
        }),
      );

    const a = makeBody(randomUUID());
    const b = makeBody(randomUUID());
    await Promise.all([
      payments.handlePaystackWebhook({ rawBody: a, signature: sign(a) }),
      payments.handlePaystackWebhook({ rawBody: b, signature: sign(b) }),
    ]);

    expect(
      await prisma.tokenLedgerEntry.count({
        where: { paymentId: init.paymentId, type: 'PURCHASE' },
      }),
    ).toBe(1);
    expect(
      (await prisma.riderWallet.findUniqueOrThrow({ where: { riderId: rider.id } })).tokenBalance,
    ).toBe(150);
  });
});
