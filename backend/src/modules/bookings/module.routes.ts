import { Router, type RequestHandler } from 'express';

import { AppError } from '../../common/errors/app-error.js';
import { authenticate, requireActiveAccount, requireRole } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import type { BookingsController } from './module.controller.js';
import {
  bookingIdSchema,
  cancelBookingSchema,
  createBookingSchema,
  listBookingsQuerySchema,
  passengerCancelAfterAcceptSchema,
  riderCancelSchema,
  riderUnableToCompleteSchema,
} from './module.schema.js';

const passengerAuth: RequestHandler[] = [
  authenticate,
  requireActiveAccount,
  (req, _res, next) => {
    if (!req.auth || (req.auth.role !== 'PASSENGER' && req.auth.role !== 'RIDER')) {
      next(
        new AppError({
          status: 403,
          code: 'FORBIDDEN',
          message: 'Only passenger accounts can access bookings',
        }),
      );
      return;
    }
    next();
  },
];

const riderAuth: RequestHandler[] = [authenticate, requireActiveAccount, requireRole('RIDER')];
const passengerOnly: RequestHandler[] = [
  authenticate,
  requireActiveAccount,
  requireRole('PASSENGER'),
];

export function createBookingsRouter(controller: BookingsController): Router {
  const router = Router();
  router.post('/', ...passengerAuth, validate({ body: createBookingSchema }), controller.create);
  router.get('/', ...passengerAuth, validate({ query: listBookingsQuerySchema }), controller.list);
  router.get(
    '/:bookingId',
    ...passengerAuth,
    validate({ params: bookingIdSchema }),
    controller.get,
  );
  router.post(
    '/:bookingId/cancel',
    ...passengerAuth,
    validate({ params: bookingIdSchema, body: cancelBookingSchema }),
    controller.cancel,
  );
  router.post(
    '/:bookingId/cancel-after-accept',
    ...passengerOnly,
    validate({ params: bookingIdSchema, body: passengerCancelAfterAcceptSchema }),
    controller.passengerCancelAfterAccept,
  );
  router.post(
    '/:bookingId/start',
    ...riderAuth,
    validate({ params: bookingIdSchema }),
    controller.startTrip,
  );
  router.post(
    '/:bookingId/complete',
    ...riderAuth,
    validate({ params: bookingIdSchema }),
    controller.completeTrip,
  );
  router.post(
    '/:bookingId/rider-cancel',
    ...riderAuth,
    validate({ params: bookingIdSchema, body: riderCancelSchema }),
    controller.riderCancel,
  );
  router.post(
    '/:bookingId/unable-to-complete',
    ...riderAuth,
    validate({ params: bookingIdSchema, body: riderUnableToCompleteSchema }),
    controller.riderUnableToComplete,
  );
  router.post(
    '/:bookingId/acknowledge',
    ...passengerOnly,
    validate({ params: bookingIdSchema }),
    controller.acknowledgeCompletion,
  );
  return router;
}
