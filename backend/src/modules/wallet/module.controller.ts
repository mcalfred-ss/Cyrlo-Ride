import type { RequestHandler } from 'express';

import { sendSuccess } from '../../common/http/response.js';
import type {
  CreatePackageInput,
  ListPageQuery,
  PurchasePackageInput,
  UpdatePackageInput,
} from './module.schema.js';
import type { WalletService } from './module.service.js';

export class WalletController {
  constructor(private readonly service: WalletService) {}

  listPackages: RequestHandler = async (_req, res, next) => {
    try {
      sendSuccess(res, await this.service.listActivePackages());
    } catch (error) {
      next(error);
    }
  };

  balance: RequestHandler = async (req, res, next) => {
    try {
      sendSuccess(res, await this.service.getBalance(req.auth!.sub));
    } catch (error) {
      next(error);
    }
  };

  ledger: RequestHandler = async (req, res, next) => {
    try {
      const query = res.locals.validated.query as ListPageQuery;
      sendSuccess(res, await this.service.listLedger(req.auth!.sub, query));
    } catch (error) {
      next(error);
    }
  };

  listPurchases: RequestHandler = async (req, res, next) => {
    try {
      const query = res.locals.validated.query as ListPageQuery;
      sendSuccess(res, await this.service.listPurchases(req.auth!.sub, query));
    } catch (error) {
      next(error);
    }
  };

  getPurchase: RequestHandler = async (req, res, next) => {
    try {
      sendSuccess(
        res,
        await this.service.getPurchase(req.auth!.sub, req.params.purchaseId as string),
      );
    } catch (error) {
      next(error);
    }
  };

  purchase: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as PurchasePackageInput;
      sendSuccess(res, await this.service.initiatePurchase(req.auth!.sub, body, req.ip), 201);
    } catch (error) {
      next(error);
    }
  };

  adminListPackages: RequestHandler = async (_req, res, next) => {
    try {
      sendSuccess(res, await this.service.listPackagesForFinance());
    } catch (error) {
      next(error);
    }
  };

  adminCreatePackage: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as CreatePackageInput;
      sendSuccess(res, await this.service.createPackage(req.auth!.sub, body, req.ip), 201);
    } catch (error) {
      next(error);
    }
  };

  adminUpdatePackage: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as UpdatePackageInput;
      sendSuccess(
        res,
        await this.service.updatePackage(
          req.auth!.sub,
          req.params.packageId as string,
          body,
          req.ip,
        ),
      );
    } catch (error) {
      next(error);
    }
  };

  adminListPurchases: RequestHandler = async (req, res, next) => {
    try {
      const query = res.locals.validated.query as ListPageQuery & { status?: string };
      sendSuccess(res, await this.service.listPurchasesForFinance(query));
    } catch (error) {
      next(error);
    }
  };

  adminListLedgers: RequestHandler = async (_req, res, next) => {
    try {
      const query = res.locals.validated.query as ListPageQuery & {
        riderId?: string;
        type?: 'PURCHASE' | 'DEDUCTION' | 'REFUND' | 'ADJUSTMENT';
        from?: string;
        to?: string;
      };
      sendSuccess(res, await this.service.listLedgersForFinance(query));
    } catch (error) {
      next(error);
    }
  };
}
