import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';

import {
  NOTIFICATION_OUTBOX_BASE_BACKOFF_MS,
  NOTIFICATION_OUTBOX_MAX_BACKOFF_MS,
} from '../config/constants.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { PushProvider } from '../infrastructure/push/push.provider.js';
import { publishNotificationCreated } from '../infrastructure/realtime/publisher.js';
import type { SmsProvider } from '../infrastructure/sms/sms.provider.js';

export interface OutboxWorkerDeps {
  prisma: PrismaClient;
  push: PushProvider;
  sms: SmsProvider;
  workerId?: string;
  now?: () => Date;
  batchSize?: number;
}

/**
 * Claims and processes pending notification outbox rows.
 * External provider calls happen outside long DB locks.
 */
export async function processNotificationOutbox(
  deps: OutboxWorkerDeps,
): Promise<{ claimed: number; completed: number; failed: number }> {
  const now = deps.now ?? (() => new Date());
  const workerId = deps.workerId ?? `worker-${randomUUID().slice(0, 8)}`;
  const batchSize = deps.batchSize ?? 20;

  await reclaimStaleProcessing(deps.prisma, now());

  const claimed = await claimBatch(deps.prisma, workerId, now(), batchSize);
  let completed = 0;
  let failed = 0;

  for (const row of claimed) {
    try {
      await processOne(deps, row, workerId, now());
      completed += 1;
    } catch (error) {
      failed += 1;
      logger.warn(
        { err: error, outboxId: row.id },
        'notification outbox item failed',
      );
    }
  }

  return { claimed: claimed.length, completed, failed };
}

export function startNotificationOutboxWorker(
  deps: OutboxWorkerDeps,
  intervalMs = env.NOTIFICATION_OUTBOX_POLL_MS,
): NodeJS.Timeout {
  const tick = () => {
    void processNotificationOutbox(deps).catch((error: unknown) => {
      logger.warn({ err: error }, 'notification outbox worker tick failed');
    });
  };
  tick();
  const handle = setInterval(tick, intervalMs);
  handle.unref();
  return handle;
}

export function computeBackoffMs(attemptCount: number): number {
  const exp = Math.min(
    NOTIFICATION_OUTBOX_MAX_BACKOFF_MS,
    NOTIFICATION_OUTBOX_BASE_BACKOFF_MS * 2 ** Math.max(0, attemptCount - 1),
  );
  const jitter = Math.floor(Math.random() * Math.min(1_000, exp / 5));
  return exp + jitter;
}

async function reclaimStaleProcessing(prisma: PrismaClient, now: Date) {
  const staleBefore = new Date(now.getTime() - env.NOTIFICATION_STALE_PROCESSING_MS);
  await prisma.notificationOutbox.updateMany({
    where: {
      status: 'PROCESSING',
      lockedAt: { lt: staleBefore },
    },
    data: {
      status: 'PENDING',
      lockedAt: null,
      lockedBy: null,
      nextAttemptAt: now,
      lastError: 'reclaimed_stale_processing',
    },
  });
}

async function claimBatch(
  prisma: PrismaClient,
  workerId: string,
  now: Date,
  batchSize: number,
) {
  return prisma.$transaction(async (tx) => {
    // Prefer SKIP LOCKED when available; fall back to conditional updates.
    const due = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM notification_outbox
      WHERE status = CAST('PENDING' AS "NotificationOutboxStatus")
        AND next_attempt_at <= ${now}
      ORDER BY next_attempt_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    `;
    const ids =
      due.length > 0
        ? due.map((row) => row.id)
        : (
            await tx.notificationOutbox.findMany({
              where: { status: 'PENDING', nextAttemptAt: { lte: now } },
              orderBy: { nextAttemptAt: 'asc' },
              take: batchSize,
              select: { id: true },
            })
          ).map((row) => row.id);
    if (ids.length === 0) return [];

    const claimedIds: string[] = [];
    for (const id of ids) {
      const updated = await tx.notificationOutbox.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'PROCESSING',
          lockedAt: now,
          lockedBy: workerId,
        },
      });
      if (updated.count === 1) claimedIds.push(id);
    }
    if (claimedIds.length === 0) return [];
    return tx.notificationOutbox.findMany({
      where: { id: { in: claimedIds }, status: 'PROCESSING', lockedBy: workerId },
    });
  });
}

async function processOne(
  deps: OutboxWorkerDeps,
  row: {
    id: string;
    userId: string;
    eventType: string;
    category: string;
    title: string;
    body: string;
    data: unknown;
    entityType: string | null;
    entityId: string | null;
    channels: string[];
    attemptCount: number;
    maxAttempts: number;
  },
  workerId: string,
  now: Date,
) {
  const prefs = await deps.prisma.notificationPreference.findUnique({
    where: { userId: row.userId },
  });
  const pushEnabled = prefs?.pushEnabled ?? true;
  const optionalSmsEnabled = prefs?.optionalSmsEnabled ?? false;

  const channels = row.channels.length > 0 ? row.channels : ['IN_APP', 'PUSH'];
  let anyRetryable = false;
  let hardFailure = false;

  for (const channel of channels) {
    if (channel === 'IN_APP') {
      await ensureDeliveryRow(deps.prisma, row.id, 'IN_APP');
      const notification = await deps.prisma.notification.upsert({
        where: { outboxId: row.id },
        create: {
          userId: row.userId,
          channel: 'IN_APP',
          eventType: row.eventType,
          category: row.category,
          title: row.title,
          body: row.body,
          data: row.data as object | undefined,
          entityType: row.entityType,
          entityId: row.entityId,
          outboxId: row.id,
        },
        update: {},
      });
      await markDelivery(deps.prisma, row.id, 'IN_APP', 'SENT', now);
      publishNotificationCreated({
        userId: row.userId,
        notificationId: notification.id,
        eventType: row.eventType,
        title: row.title,
        createdAt: notification.createdAt.toISOString(),
      });
      continue;
    }

    if (channel === 'PUSH') {
      await ensureDeliveryRow(deps.prisma, row.id, 'PUSH');
      if (!pushEnabled) {
        await markDelivery(deps.prisma, row.id, 'PUSH', 'CANCELLED', now, {
          code: 'PREFERENCE_DISABLED',
          message: 'push disabled by preference',
        });
        continue;
      }
      const tokens = await deps.prisma.deviceToken.findMany({
        where: { userId: row.userId, isActive: true },
      });
      if (tokens.length === 0) {
        await markDelivery(deps.prisma, row.id, 'PUSH', 'CANCELLED', now, {
          code: 'NO_DEVICE',
          message: 'no active device tokens',
        });
        continue;
      }
      let sentAny = false;
      let retryable = false;
      for (const device of tokens) {
        const result = await deps.push.sendToToken({
          token: device.token,
          platform: device.platform,
          message: {
            title: row.title,
            body: row.body,
            data: toPushData(row),
          },
        });
        if (result.outcome === 'sent') {
          sentAny = true;
          await deps.prisma.deviceToken.update({
            where: { id: device.id },
            data: { lastSeenAt: now },
          });
        } else if (result.outcome === 'invalid_token') {
          await deps.prisma.deviceToken.update({
            where: { id: device.id },
            data: { isActive: false },
          });
        } else if (result.outcome === 'retryable') {
          retryable = true;
        }
      }
      if (sentAny) {
        await markDelivery(deps.prisma, row.id, 'PUSH', 'SENT', now);
      } else if (retryable) {
        anyRetryable = true;
        await markDelivery(deps.prisma, row.id, 'PUSH', 'FAILED', now, {
          code: 'RETRYABLE',
          message: 'temporary push failure',
        });
      } else {
        await markDelivery(deps.prisma, row.id, 'PUSH', 'FAILED', now, {
          code: 'NO_SUCCESS',
          message: 'no device accepted push',
        });
      }
      continue;
    }

    if (channel === 'SMS') {
      await ensureDeliveryRow(deps.prisma, row.id, 'SMS');
      // OTP must never flow through this path. Optional SMS only when preference allows.
      if (!optionalSmsEnabled) {
        await markDelivery(deps.prisma, row.id, 'SMS', 'CANCELLED', now, {
          code: 'PREFERENCE_DISABLED',
          message: 'optional SMS disabled',
        });
        continue;
      }
      const user = await deps.prisma.user.findUnique({
        where: { id: row.userId },
        select: { phoneNumber: true },
      });
      if (!user?.phoneNumber) {
        await markDelivery(deps.prisma, row.id, 'SMS', 'FAILED', now, {
          code: 'NO_PHONE',
          message: 'user phone missing',
        });
        continue;
      }
      try {
        await deps.sms.send({
          to: user.phoneNumber,
          body: `${row.title}: ${row.body}`.slice(0, 320),
        });
        await markDelivery(deps.prisma, row.id, 'SMS', 'SENT', now);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'sms_failed';
        const retryable =
          message.includes('timeout') ||
          message.includes('Unavailable') ||
          message.includes('503') ||
          message.includes('429');
        if (retryable) anyRetryable = true;
        else hardFailure = true;
        await markDelivery(deps.prisma, row.id, 'SMS', 'FAILED', now, {
          code: 'SMS_ERROR',
          message: message.slice(0, 200),
        });
      }
    }
  }

  const attemptCount = row.attemptCount + 1;
  if (anyRetryable && attemptCount < row.maxAttempts) {
    await deps.prisma.notificationOutbox.update({
      where: { id: row.id },
      data: {
        status: 'PENDING',
        attemptCount,
        nextAttemptAt: new Date(now.getTime() + computeBackoffMs(attemptCount)),
        lockedAt: null,
        lockedBy: null,
        lastError: 'retryable_channel_failure',
      },
    });
    return;
  }

  if (anyRetryable || hardFailure) {
    await deps.prisma.notificationOutbox.update({
      where: { id: row.id },
      data: {
        status: 'DEAD_LETTER',
        attemptCount,
        lockedAt: null,
        lockedBy: null,
        lastError: anyRetryable ? 'max_attempts_exceeded' : 'permanent_channel_failure',
        completedAt: now,
      },
    });
    return;
  }

  await deps.prisma.notificationOutbox.update({
    where: { id: row.id },
    data: {
      status: 'COMPLETED',
      attemptCount,
      lockedAt: null,
      lockedBy: null,
      completedAt: now,
      lastError: null,
    },
  });
  void workerId;
}

function toPushData(row: {
  eventType: string;
  category: string;
  entityType: string | null;
  entityId: string | null;
  data: unknown;
}): Record<string, string> {
  const out: Record<string, string> = {
    eventType: row.eventType,
    category: row.category,
  };
  if (row.entityType) out.entityType = row.entityType;
  if (row.entityId) out.entityId = row.entityId;
  if (row.data && typeof row.data === 'object' && row.data !== null) {
    for (const [key, value] of Object.entries(row.data as Record<string, unknown>)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        out[key] = String(value);
      }
    }
  }
  return out;
}

async function ensureDeliveryRow(
  prisma: PrismaClient,
  outboxId: string,
  channel: 'IN_APP' | 'PUSH' | 'SMS',
) {
  await prisma.notificationDelivery.upsert({
    where: { outboxId_channel: { outboxId, channel } },
    create: { outboxId, channel, status: 'PENDING' },
    update: {},
  });
}

async function markDelivery(
  prisma: PrismaClient,
  outboxId: string,
  channel: 'IN_APP' | 'PUSH' | 'SMS',
  status: 'SENT' | 'FAILED' | 'CANCELLED',
  now: Date,
  provider?: { code: string; message: string },
) {
  await prisma.notificationDelivery.update({
    where: { outboxId_channel: { outboxId, channel } },
    data: {
      status,
      attemptCount: { increment: 1 },
      sentAt: status === 'SENT' ? now : undefined,
      providerCode: provider?.code,
      providerMessage: provider?.message,
    },
  });
}

export async function getNotificationOutboxStats(prisma: PrismaClient) {
  const [pending, processing, completed, failed, deadLetter] = await Promise.all([
    prisma.notificationOutbox.count({ where: { status: 'PENDING' } }),
    prisma.notificationOutbox.count({ where: { status: 'PROCESSING' } }),
    prisma.notificationOutbox.count({ where: { status: 'COMPLETED' } }),
    prisma.notificationOutbox.count({ where: { status: 'FAILED' } }),
    prisma.notificationOutbox.count({ where: { status: 'DEAD_LETTER' } }),
  ]);
  return { pending, processing, completed, failed, deadLetter };
}
