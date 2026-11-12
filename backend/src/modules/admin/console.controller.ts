import type { RequestHandler } from 'express';

import { sendSuccess } from '../../common/http/response.js';
import type {
  AnalyticsQuery,
  ListAdminBookingsQuery,
  ListAuditLogsQuery,
  ListPassengersQuery,
} from './console.schema.js';
import type { AdminConsoleService } from './console.service.js';

export class AdminConsoleController {
  constructor(private readonly service: AdminConsoleService) {}

  analytics: RequestHandler = async (_req, res, next) => {
    try {
      const query = res.locals.validated.query as AnalyticsQuery;
      sendSuccess(res, await this.service.getAnalytics(query));
    } catch (error) {
      next(error);
    }
  };

  financialReport: RequestHandler = async (_req, res, next) => {
    try {
      const query = res.locals.validated.query as AnalyticsQuery;
      sendSuccess(res, await this.service.getFinancialReport(query));
    } catch (error) {
      next(error);
    }
  };

  listPassengers: RequestHandler = async (_req, res, next) => {
    try {
      const query = res.locals.validated.query as ListPassengersQuery;
      sendSuccess(res, await this.service.listPassengers(query));
    } catch (error) {
      next(error);
    }
  };

  getPassenger: RequestHandler = async (req, res, next) => {
    try {
      sendSuccess(res, await this.service.getPassenger(req.params.passengerId as string));
    } catch (error) {
      next(error);
    }
  };

  listPassengerBookings: RequestHandler = async (req, res, next) => {
    try {
      const query = res.locals.validated.query as { page: number; pageSize: number };
      sendSuccess(
        res,
        await this.service.listPassengerBookings(
          req.params.passengerId as string,
          query.page,
          query.pageSize,
        ),
      );
    } catch (error) {
      next(error);
    }
  };

  listPassengerCancellations: RequestHandler = async (req, res, next) => {
    try {
      const query = res.locals.validated.query as { page: number; pageSize: number };
      sendSuccess(
        res,
        await this.service.listPassengerCancellations(
          req.params.passengerId as string,
          query.page,
          query.pageSize,
        ),
      );
    } catch (error) {
      next(error);
    }
  };

  listBookings: RequestHandler = async (_req, res, next) => {
    try {
      const query = res.locals.validated.query as ListAdminBookingsQuery;
      sendSuccess(res, await this.service.listBookings(query));
    } catch (error) {
      next(error);
    }
  };

  getBooking: RequestHandler = async (req, res, next) => {
    try {
      sendSuccess(res, await this.service.getBooking(req.params.bookingId as string));
    } catch (error) {
      next(error);
    }
  };

  listAuditLogs: RequestHandler = async (_req, res, next) => {
    try {
      const query = res.locals.validated.query as ListAuditLogsQuery;
      sendSuccess(res, await this.service.listAuditLogs(query));
    } catch (error) {
      next(error);
    }
  };
}
