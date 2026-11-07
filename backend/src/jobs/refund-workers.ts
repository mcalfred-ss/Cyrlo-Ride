import type { PaymentsService } from '../modules/payments/module.service.js';
import { logger } from '../config/logger.js';

/**
 * Durable refund submit + reconcile + missing-refund sweeper.
 * Safe for a single writer; claim uses conditional updates for multi-instance.
 */
export function startRefundWorkers(
  payments: PaymentsService,
  intervalMs = 10_000,
): NodeJS.Timeout {
  const tick = () => {
    void payments.processRefundWorkerTick?.().then(
      (result) => {
        if (
          result &&
          (result.submitted > 0 || result.reconciled > 0 || result.missingRefundsQueued > 0)
        ) {
          logger.info(result, 'refund worker tick');
        }
      },
      (error: unknown) => {
        logger.warn({ err: error }, 'refund worker tick failed');
      },
    );
  };
  tick();
  const handle = setInterval(tick, intervalMs);
  handle.unref();
  return handle;
}
