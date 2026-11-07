import { AppError } from '../../common/errors/app-error.js';
import type {
  ListNotificationsQuery,
  RegisterDeviceInput,
  UpdateDeviceInput,
  UpdatePreferencesInput,
} from './module.schema.js';
import type { NotificationsRepository } from './module.repository.js';

export interface NotificationsServiceDeps {
  now?: () => Date;
}

export interface NotificationsService {
  listMine(userId: string, query: ListNotificationsQuery): Promise<unknown>;
  getMine(userId: string, notificationId: string): Promise<unknown>;
  markRead(userId: string, notificationId: string): Promise<unknown>;
  markAllRead(userId: string): Promise<unknown>;
  unreadCount(userId: string): Promise<unknown>;
  registerDevice(userId: string, input: RegisterDeviceInput): Promise<unknown>;
  updateDevice(userId: string, deviceId: string, input: UpdateDeviceInput): Promise<unknown>;
  deactivateDevice(userId: string, deviceId: string): Promise<unknown>;
  listDevices(userId: string): Promise<unknown>;
  getPreferences(userId: string): Promise<unknown>;
  updatePreferences(userId: string, input: UpdatePreferencesInput): Promise<unknown>;
}

export class NotificationsServiceImpl implements NotificationsService {
  private readonly now: () => Date;

  constructor(
    private readonly repository: NotificationsRepository,
    deps: NotificationsServiceDeps = {},
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  async listMine(userId: string, query: ListNotificationsQuery) {
    const { total, items } = await this.repository.listForUser({
      userId,
      page: query.page,
      pageSize: query.pageSize,
      category: query.category,
      unreadOnly: query.unreadOnly,
    });
    return {
      items: items.map(toNotificationView),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        hasNextPage: query.page * query.pageSize < total,
      },
    };
  }

  async getMine(userId: string, notificationId: string) {
    const row = await this.repository.findForUser(notificationId, userId);
    if (!row) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Notification not found' });
    }
    return toNotificationView(row);
  }

  async markRead(userId: string, notificationId: string) {
    const existing = await this.repository.findForUser(notificationId, userId);
    if (!existing) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Notification not found' });
    }
    if (!existing.readAt) {
      await this.repository.markRead(notificationId, userId, this.now());
    }
    const refreshed = await this.repository.findForUser(notificationId, userId);
    return toNotificationView(refreshed!);
  }

  async markAllRead(userId: string) {
    const updated = await this.repository.markAllRead(userId, this.now());
    return { updated };
  }

  async unreadCount(userId: string) {
    return { unreadCount: await this.repository.unreadCount(userId) };
  }

  async registerDevice(userId: string, input: RegisterDeviceInput) {
    const device = await this.repository.upsertDevice({
      userId,
      token: input.token,
      platform: input.platform,
      provider: input.provider,
      now: this.now(),
    });
    return toDeviceView(device);
  }

  async updateDevice(userId: string, deviceId: string, input: UpdateDeviceInput) {
    try {
      const device = await this.repository.updateDevice({
        deviceId,
        userId,
        token: input.token,
        platform: input.platform,
        provider: input.provider,
        now: this.now(),
      });
      if (!device) {
        throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Device not found' });
      }
      return toDeviceView(device);
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
          message: 'Device token already registered',
        });
      }
      throw error;
    }
  }

  async deactivateDevice(userId: string, deviceId: string) {
    const ok = await this.repository.deactivateDevice(deviceId, userId);
    if (!ok) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Device not found' });
    }
    return { deviceId, isActive: false };
  }

  async listDevices(userId: string) {
    return (await this.repository.listDevices(userId)).map(toDeviceView);
  }

  async getPreferences(userId: string) {
    const prefs = await this.repository.getOrCreatePreferences(userId);
    return {
      pushEnabled: prefs.pushEnabled,
      optionalSmsEnabled: prefs.optionalSmsEnabled,
      // OTP / critical transactional in-app history cannot be disabled.
      mandatoryChannels: ['IN_APP', 'OTP_SMS'],
    };
  }

  async updatePreferences(userId: string, input: UpdatePreferencesInput) {
    const prefs = await this.repository.updatePreferences(userId, input);
    return {
      pushEnabled: prefs.pushEnabled,
      optionalSmsEnabled: prefs.optionalSmsEnabled,
      mandatoryChannels: ['IN_APP', 'OTP_SMS'],
    };
  }
}

function toNotificationView(row: {
  id: string;
  userId: string;
  eventType: string | null;
  category: string | null;
  title: string;
  body: string;
  data: unknown;
  entityType: string | null;
  entityId: string | null;
  readAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    eventType: row.eventType,
    category: row.category,
    title: row.title,
    body: row.body,
    data: row.data,
    entityType: row.entityType,
    entityId: row.entityId,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDeviceView(row: {
  id: string;
  platform: string;
  provider: string;
  isActive: boolean;
  lastSeenAt: Date;
  createdAt: Date;
  token: string;
}) {
  return {
    id: row.id,
    platform: row.platform,
    provider: row.provider,
    isActive: row.isActive,
    lastSeenAt: row.lastSeenAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    // Never return full device token to clients after registration ack — mask.
    tokenPreview: `${row.token.slice(0, 6)}…${row.token.slice(-4)}`,
  };
}
