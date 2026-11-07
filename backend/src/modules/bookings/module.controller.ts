import type { RequestHandler } from 'express';

import { sendSuccess } from '../../common/http/response.js';
import type {
  CancelBookingInput,
  CreateBookingInput,
  ListBookingsQuery,
  PassengerCancelAfterAcceptInput,
  RiderCancelInput,
  RiderUnableToCompleteInput,
} from './module.schema.js';
import type { BookingsService } from './module.service.js';

export class BookingsController {
  constructor(private readonly service: BookingsService) {}

  create: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as CreateBookingInput;
      const data = await this.service.create(req.auth!.sub, body, req.ip);
      sendSuccess(res, data, 201);
    } catch (error) {
      next(error);
    }
  };

  list: RequestHandler = async (req, res, next) => {
    try {
      const query = res.locals.validated.query as ListBookingsQuery;
      const data = await this.service.listOwn(req.auth!.sub, query);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  get: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.getOwn(req.auth!.sub, req.params.bookingId as string);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  cancel: RequestHandler = async (req, res, next) => {
    try {
      const body = (res.locals.validated.body ?? {}) as CancelBookingInput;
      const data = await this.service.cancel(
        req.auth!.sub,
        req.params.bookingId as string,
        body,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  startTrip: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.startTrip(
        req.auth!.sub,
        req.params.bookingId as string,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  completeTrip: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.completeTrip(
        req.auth!.sub,
        req.params.bookingId as string,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  riderCancel: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as RiderCancelInput;
      const data = await this.service.riderCancelAfterAccept(
        req.auth!.sub,
        req.params.bookingId as string,
        body,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  riderUnableToComplete: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as RiderUnableToCompleteInput;
      const data = await this.service.riderUnableToComplete(
        req.auth!.sub,
        req.params.bookingId as string,
        body,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  passengerCancelAfterAccept: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as PassengerCancelAfterAcceptInput;
      const data = await this.service.requestPassengerCancelAfterAccept(
        req.auth!.sub,
        req.params.bookingId as string,
        body,
        req.ip,
      );
      sendSuccess(res, data, 201);
    } catch (error) {
      next(error);
    }
  };

  acknowledgeCompletion: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.acknowledgeCompletion(
        req.auth!.sub,
        req.params.bookingId as string,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };
}
