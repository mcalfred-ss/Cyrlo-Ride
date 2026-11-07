import type { Prisma, PrismaClient } from '@prisma/client';

import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export type NotificationDbClient = PrismaClient | Prisma.TransactionClient;

export interface ScheduleNotificationInput {
  userId: string;
  eventType: string;
  category: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  entityType?: string;
  entityId?: string;
  /** Defaults to IN_APP + PUSH. Never include OTP content. */
  channels?: Array<'IN_APP' | 'PUSH' | 'SMS'>;
  /** Unique key — duplicate inserts are ignored. */
  dedupeKey?: string;
  maxAttempts?: number;
}

/**
 * Persist a notification outbox row. Prefer calling inside the business transaction
 * via `scheduleNotificationInTx`. Delivery (push/SMS/socket) happens in the worker.
 *
 * Never store OTP codes or secrets in title/body/data.
 */
export async function scheduleNotificationInTx(
  tx: NotificationDbClient,
  input: ScheduleNotificationInput,
): Promise<{ id: string; created: boolean }> {
  const channels = input.channels ?? ['IN_APP', 'PUSH'];
  const maxAttempts = input.maxAttempts ?? env.NOTIFICATION_OUTBOX_MAX_ATTEMPTS;
  try {
    const row = await tx.notificationOutbox.create({
      data: {
        userId: input.userId,
        eventType: input.eventType,
        category: input.category,
        title: input.title,
        body: input.body,
        data: (sanitizeMetadata(input.data) as Prisma.InputJsonValue | undefined) ?? undefined,
        entityType: input.entityType,
        entityId: input.entityId,
        channels,
        dedupeKey: input.dedupeKey,
        maxAttempts,
        status: 'PENDING',
        nextAttemptAt: new Date(),
      },
    });
    return { id: row.id, created: true };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002' &&
      input.dedupeKey
    ) {
      const existing = await tx.notificationOutbox.findUnique({
        where: { dedupeKey: input.dedupeKey },
        select: { id: true },
      });
      if (existing) return { id: existing.id, created: false };
    }
    throw error;
  }
}

/**
 * Fire-and-forget outbox schedule for call sites that already committed.
 * Never throws into the caller. Does not send push/SMS synchronously.
 */
export function enqueueInAppNotification(
  prisma: PrismaClient,
  input: {
    userId: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    eventType?: string;
    category?: string;
    entityType?: string;
    entityId?: string;
    channels?: Array<'IN_APP' | 'PUSH' | 'SMS'>;
    dedupeKey?: string;
  },
): void {
  const eventType = input.eventType ?? inferEventType(input.title, input.data);
  const category = input.category ?? inferCategory(eventType);
  void scheduleNotificationInTx(prisma, {
    userId: input.userId,
    eventType,
    category,
    title: input.title,
    body: input.body,
    data: input.data,
    entityType: input.entityType ?? (typeof input.data?.bookingId === 'string' ? 'booking' : undefined),
    entityId:
      input.entityId ??
      (typeof input.data?.bookingId === 'string' ? input.data.bookingId : undefined),
    channels: input.channels,
    dedupeKey: input.dedupeKey,
  }).catch((error: unknown) => {
    logger.warn({ err: error, userId: input.userId }, 'notification outbox enqueue failed');
  });
}

function sanitizeMetadata(
  data: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const blocked = new Set([
    'otp',
    'code',
    'ghanaCard',
    'ghanaCardNumber',
    'secret',
    'password',
    'token',
    'accessToken',
    'refreshToken',
    'authorization',
    'latitude',
    'longitude',
    'coordinates',
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (blocked.has(key)) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else if (value === null) {
      out[key] = null;
    }
  }
  return out;
}

function inferEventType(title: string, data?: Record<string, unknown>): string {
  if (typeof data?.status === 'string') {
    return `legacy.${String(data.status).toLowerCase()}`;
  }
  return `legacy.${title.toLowerCase().replace(/\s+/g, '_').slice(0, 60)}`;
}

function inferCategory(eventType: string): string {
  if (eventType.includes('offer') || eventType.includes('matching')) return 'MATCHING';
  if (eventType.includes('token') || eventType.includes('wallet') || eventType.includes('purchase')) {
    return 'WALLET';
  }
  if (eventType.includes('dispute') || eventType.includes('trip') || eventType.includes('cancel')) {
    return 'TRIP';
  }
  if (eventType.includes('payment') || eventType.includes('refund') || eventType.includes('booking')) {
    return 'BOOKING';
  }
  if (eventType.includes('rider') || eventType.includes('vehicle')) return 'RIDER';
  return 'GENERAL';
}
