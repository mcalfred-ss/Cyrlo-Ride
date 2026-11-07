import type { RequestHandler } from 'express';

import { sendSuccess } from '../../common/http/response.js';
import type {
  CreateDisputeInput,
  ListDisputesQuery,
  SupportRecommendationInput,
} from './module.schema.js';
import type { DisputesService } from './module.service.js';

export class DisputesController {
  constructor(private readonly service: DisputesService) {}

  submit: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as CreateDisputeInput;
      const data = await this.service.submit(
        req.auth!.sub,
        req.auth!.role,
        req.params.bookingId as string,
        body,
        req.ip,
      );
      sendSuccess(res, data, 201);
    } catch (error) {
      next(error);
    }
  };

  list: RequestHandler = async (req, res, next) => {
    try {
      const query = res.locals.validated.query as ListDisputesQuery;
      const data = await this.service.listForSupport(query);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  get: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.getForSupport(req.params.disputeId as string);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  tripGps: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.getTripGpsEvidence(
        req.auth!.sub,
        req.params.bookingId as string,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  recommendDispute: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as SupportRecommendationInput;
      const data = await this.service.recommendOnDispute(
        req.auth!.sub,
        req.params.disputeId as string,
        body,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  listCancellationRequests: RequestHandler = async (req, res, next) => {
    try {
      const query = res.locals.validated.query as { page: number; pageSize: number };
      const data = await this.service.listCancellationRequests(query.page, query.pageSize);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  recommendCancellation: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as SupportRecommendationInput;
      const data = await this.service.recommendOnCancellationRequest(
        req.auth!.sub,
        req.params.requestId as string,
        body,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };
}
