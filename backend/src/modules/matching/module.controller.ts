import type { RequestHandler } from 'express';

import { sendSuccess } from '../../common/http/response.js';
import type { MatchingService } from './module.service.js';

export class MatchingController {
  constructor(private readonly service: MatchingService) {}

  nearby: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.discoverNearby(req.body);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  listMyOffers: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.listMyPendingOffers(req.auth!.sub);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  accept: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.acceptOffer(
        req.auth!.sub,
        req.params.offerId as string,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  reject: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.rejectOffer(
        req.auth!.sub,
        req.params.offerId as string,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  passengerStatus: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.getPassengerMatchingStatus(
        req.auth!.sub,
        req.params.bookingId as string,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };
}
