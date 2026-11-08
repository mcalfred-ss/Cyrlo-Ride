import { Router, type RequestHandler } from 'express';

import { authenticate, requireActiveAccount } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import type { MapsController } from './module.controller.js';
import {
  geocodeBodySchema,
  placeSearchBodySchema,
  reverseGeocodeBodySchema,
  routeBodySchema,
} from './module.schema.js';

const userAuth: RequestHandler[] = [authenticate, requireActiveAccount];

/**
 * Privileged Maps proxy for Flutter / clients.
 * Maps API key stays server-side; clients use Ride JWTs only.
 */
export function createMapsRouter(controller: MapsController): Router {
  const router = Router();

  router.get('/config', ...userAuth, controller.config);
  router.post('/geocode', ...userAuth, validate({ body: geocodeBodySchema }), controller.geocode);
  router.post(
    '/geocode/reverse',
    ...userAuth,
    validate({ body: reverseGeocodeBodySchema }),
    controller.reverse,
  );
  router.post(
    '/places/search',
    ...userAuth,
    validate({ body: placeSearchBodySchema }),
    controller.places,
  );
  router.post('/routes', ...userAuth, validate({ body: routeBodySchema }), controller.route);
  router.post(
    '/routes/estimate',
    ...userAuth,
    validate({ body: routeBodySchema }),
    controller.estimate,
  );

  return router;
}
