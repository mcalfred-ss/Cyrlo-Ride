import type { RequestHandler } from 'express';
import type { PaymentRefundStatus } from '@prisma/client';

import { sendSuccess } from '../../common/http/response.js';
import type { InitiateBookingFeeInput } from './module.schema.js';
import type { PaymentsService } from './module.service.js';

export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  initiateBookingFee: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as InitiateBookingFeeInput;
      const data = await this.service.initiateBookingFee(req.auth!.sub, body, req.ip);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  paystackWebhook: RequestHandler = async (req, res, next) => {
    try {
      const rawBody = req.rawBody;
      if (!rawBody) {
        next(new Error('Missing raw body for Paystack webhook'));
        return;
      }
      const data = await this.service.handlePaystackWebhook({
        rawBody,
        signature: req.header('x-paystack-signature') ?? undefined,
      });
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  listRefunds: RequestHandler = async (req, res, next) => {
    try {
      const status = req.query.status as PaymentRefundStatus | undefined;
      const data = await this.service.listRefundsForFinance(status);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  executeRefund: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.executeRefund(
        req.auth!.sub,
        req.params.refundId as string,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  reconcileRefund: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.reconcileRefund(
        req.auth!.sub,
        req.params.refundId as string,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  listRefundAttempts: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.listRefundReconciliationAttempts(
        req.params.refundId as string,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  listReconciliationCases: RequestHandler = async (req, res, next) => {
    try {
      const status = req.query.status as 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | undefined;
      const data = await this.service.listReconciliationCases(status);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  resolveReconciliationCase: RequestHandler = async (req, res, next) => {
    try {
      const body = (res.locals.validated?.body ?? {}) as { notes?: string };
      const data = await this.service.resolveReconciliationCase(
        req.auth!.sub,
        req.params.caseId as string,
        body.notes,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };
}
