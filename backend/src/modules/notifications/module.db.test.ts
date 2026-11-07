import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  computeBackoffMs,
  processNotificationOutbox,
} from '../../jobs/notification-outbox-worker.js';
import { scheduleNotificationInTx } from '../../infrastructure/notifications/notify.js';
import { MemoryPushProvider } from '../../infrastructure/push/push.provider.js';
import { DevelopmentSmsProvider } from '../../infrastructure/sms/sms.provider.js';
import { NotificationsRepository } from './module.repository.js';
import { NotificationsServiceImpl } from './module.service.js';

const prisma = new PrismaClient();
const userIds: string[] = [];

describe('notification outbox postgres', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.notificationDelivery.deleteMany({
      where: { outbox: { userId: { in: userIds } } },
    });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notificationOutbox.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.deviceToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notificationPreference.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  async function seedUser() {
    const user = await prisma.user.create({
      data: {
        phoneNumber: `+23370${randomUUID().replace(/-/g, '').slice(0, 9)}`,
        role: 'PASSENGER',
        status: 'ACTIVE',
      },
    });
    userIds.push(user.id);
    return user;
  }

  it('commits outbox with business work and delivers idempotently via worker', async () => {
    const user = await seedUser();
    const push = new MemoryPushProvider();
    const sms = new DevelopmentSmsProvider();
    const service = new NotificationsServiceImpl(new NotificationsRepository(prisma));

    await service.registerDevice(user.id, {
      token: `device-token-${randomUUID()}`,
      platform: 'ANDROID',
      provider: 'FCM',
    });

    const dedupeKey = `booking.created:${user.id}:${randomUUID()}`;
    await prisma.$transaction(async (tx) => {
      // Simulate business side-effect marker via preference upsert in same TX as outbox.
      await tx.notificationPreference.upsert({
        where: { userId: user.id },
        create: { userId: user.id, pushEnabled: true, optionalSmsEnabled: false },
        update: {},
      });
      await scheduleNotificationInTx(tx, {
        userId: user.id,
        eventType: 'booking.created',
        category: 'BOOKING',
        title: 'Booking created',
        body: 'Pay the booking fee to continue.',
        entityType: 'booking',
        entityId: randomUUID(),
        dedupeKey,
        channels: ['IN_APP', 'PUSH'],
      });
    });

    const again = await scheduleNotificationInTx(prisma, {
      userId: user.id,
      eventType: 'booking.created',
      category: 'BOOKING',
      title: 'Booking created',
      body: 'Pay the booking fee to continue.',
      dedupeKey,
    });
    expect(again.created).toBe(false);

    const first = await processNotificationOutbox({ prisma, push, sms, batchSize: 10 });
    expect(first.completed).toBeGreaterThanOrEqual(1);

    const notifications = await prisma.notification.findMany({ where: { userId: user.id } });
    expect(notifications).toHaveLength(1);
    expect(push.sent.length).toBe(1);

    const second = await processNotificationOutbox({ prisma, push, sms, batchSize: 10 });
    expect(second.claimed).toBe(0);
    expect(push.sent.length).toBe(1);

    const list = (await service.listMine(user.id, {
      page: 1,
      pageSize: 20,
    })) as { items: Array<{ id: string }>; pagination: { total: number } };
    expect(list.pagination.total).toBe(1);
    await service.markRead(user.id, list.items[0]!.id);
    expect((await service.unreadCount(user.id)) as { unreadCount: number }).toEqual({
      unreadCount: 0,
    });
  });

  it('does not deactivate tokens on temporary push failure; deactivates invalid tokens', async () => {
    const user = await seedUser();
    const push = new MemoryPushProvider();
    const sms = new DevelopmentSmsProvider();
    const service = new NotificationsServiceImpl(new NotificationsRepository(prisma));
    const good = await service.registerDevice(user.id, {
      token: `good-${randomUUID()}`,
      platform: 'IOS',
      provider: 'FCM',
    });
    const badToken = `bad-${randomUUID()}`;
    await service.registerDevice(user.id, {
      token: badToken,
      platform: 'ANDROID',
      provider: 'FCM',
    });
    push.invalidTokens.add(badToken);

    await scheduleNotificationInTx(prisma, {
      userId: user.id,
      eventType: 'trip.started',
      category: 'TRIP',
      title: 'Trip started',
      body: 'Your rider started the trip.',
      channels: ['IN_APP', 'PUSH'],
      dedupeKey: `trip.started:${user.id}:${randomUUID()}`,
    });

    await processNotificationOutbox({ prisma, push, sms });

    const devices = await prisma.deviceToken.findMany({ where: { userId: user.id } });
    expect(devices.find((d) => d.token === badToken)?.isActive).toBe(false);
    expect(devices.find((d) => d.id === (good as { id: string }).id)?.isActive).toBe(true);
    expect(computeBackoffMs(2)).toBeGreaterThan(5_000);
  });

  it('isolates notification ownership', async () => {
    const a = await seedUser();
    const b = await seedUser();
    const service = new NotificationsServiceImpl(new NotificationsRepository(prisma));
    await scheduleNotificationInTx(prisma, {
      userId: a.id,
      eventType: 'wallet.credited',
      category: 'WALLET',
      title: 'Tokens credited',
      body: 'Balance updated.',
      channels: ['IN_APP'],
      dedupeKey: `wallet:${a.id}:${randomUUID()}`,
    });
    await processNotificationOutbox({
      prisma,
      push: new MemoryPushProvider(),
      sms: new DevelopmentSmsProvider(),
    });
    const listA = (await service.listMine(a.id, { page: 1, pageSize: 20 })) as {
      pagination: { total: number };
    };
    const listB = (await service.listMine(b.id, { page: 1, pageSize: 20 })) as {
      pagination: { total: number };
    };
    expect(listA.pagination.total).toBeGreaterThanOrEqual(1);
    expect(listB.pagination.total).toBe(0);
  });
});
