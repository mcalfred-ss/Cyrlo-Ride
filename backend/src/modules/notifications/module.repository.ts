import type { Prisma, PrismaClient } from '@prisma/client';

/** Private to the notifications module. */
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  protected database(): PrismaClient {
    return this.prisma;
  }

  async listForUser(input: {
    userId: string;
    page: number;
    pageSize: number;
    category?: string;
    unreadOnly?: boolean;
  }) {
    const where: Prisma.NotificationWhereInput = {
      userId: input.userId,
      channel: 'IN_APP',
      ...(input.category ? { category: input.category } : {}),
      ...(input.unreadOnly ? { readAt: null } : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ]);
    return { total, items };
  }

  async findForUser(notificationId: string, userId: string) {
    return this.prisma.notification.findFirst({
      where: { id: notificationId, userId, channel: 'IN_APP' },
    });
  }

  async markRead(notificationId: string, userId: string, now: Date) {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: now },
    });
    return result.count === 1;
  }

  async markAllRead(userId: string, now: Date) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, channel: 'IN_APP', readAt: null },
      data: { readAt: now },
    });
    return result.count;
  }

  async unreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, channel: 'IN_APP', readAt: null },
    });
  }

  async upsertDevice(input: {
    userId: string;
    token: string;
    platform: 'ANDROID' | 'IOS' | 'WEB';
    provider: string;
    now: Date;
  }) {
    return this.prisma.deviceToken.upsert({
      where: { userId_token: { userId: input.userId, token: input.token } },
      create: {
        userId: input.userId,
        token: input.token,
        platform: input.platform,
        provider: input.provider,
        isActive: true,
        lastSeenAt: input.now,
      },
      update: {
        platform: input.platform,
        provider: input.provider,
        isActive: true,
        lastSeenAt: input.now,
      },
    });
  }

  async updateDevice(input: {
    deviceId: string;
    userId: string;
    token?: string;
    platform?: 'ANDROID' | 'IOS' | 'WEB';
    provider?: string;
    now: Date;
  }) {
    const existing = await this.prisma.deviceToken.findFirst({
      where: { id: input.deviceId, userId: input.userId },
    });
    if (!existing) return null;
    return this.prisma.deviceToken.update({
      where: { id: input.deviceId },
      data: {
        token: input.token,
        platform: input.platform,
        provider: input.provider,
        isActive: true,
        lastSeenAt: input.now,
      },
    });
  }

  async deactivateDevice(deviceId: string, userId: string) {
    const result = await this.prisma.deviceToken.updateMany({
      where: { id: deviceId, userId, isActive: true },
      data: { isActive: false },
    });
    return result.count === 1;
  }

  async listDevices(userId: string) {
    return this.prisma.deviceToken.findMany({
      where: { userId, isActive: true },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  async getOrCreatePreferences(userId: string) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, pushEnabled: true, optionalSmsEnabled: false },
      update: {},
    });
  }

  async updatePreferences(
    userId: string,
    input: { pushEnabled?: boolean; optionalSmsEnabled?: boolean },
  ) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        pushEnabled: input.pushEnabled ?? true,
        optionalSmsEnabled: input.optionalSmsEnabled ?? false,
      },
      update: {
        pushEnabled: input.pushEnabled,
        optionalSmsEnabled: input.optionalSmsEnabled,
      },
    });
  }
}
