import { Router, type RequestHandler } from 'express';

import { authenticate, requireActiveAccount, requireRole } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import type { MatchingController } from './module.controller.js';
import { bookingIdParamSchema, offerIdParamSchema } from './module.schema.js';

const riderAuth: RequestHandler[] = [authenticate, requireActiveAccount, requireRole('RIDER')];
const passengerAuth: RequestHandler[] = [
  authenticate,
  requireActiveAccount,
  requireRole('PASSENGER'),
];

export function createMatchingRouter(controller: MatchingController): Router {
  const router = Router();
  router.get('/offers', ...riderAuth, controller.listMyOffers);
  router.post(
    '/offers/:offerId/accept',
    ...riderAuth,
    validate({ params: offerIdParamSchema }),
    controller.accept,
  );
  router.post(
    '/offers/:offerId/reject',
    ...riderAuth,
    validate({ params: offerIdParamSchema }),
    controller.reject,
  );
  router.get(
    '/bookings/:bookingId/status',
    ...passengerAuth,
    validate({ params: bookingIdParamSchema }),
    controller.passengerStatus,
  );
  return router;
}
