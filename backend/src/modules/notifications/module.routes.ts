import { Router, type RequestHandler } from 'express';

import { authenticate, requireActiveAccount } from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import type { NotificationsController } from './module.controller.js';
import {
  deviceIdParamSchema,
  listNotificationsQuerySchema,
  notificationIdParamSchema,
  registerDeviceSchema,
  updateDeviceSchema,
  updatePreferencesSchema,
} from './module.schema.js';

const auth: RequestHandler[] = [authenticate, requireActiveAccount];

export function createNotificationsRouter(controller: NotificationsController): Router {
  const router = Router();

  router.get('/', ...auth, validate({ query: listNotificationsQuerySchema }), controller.list);
  router.get('/unread-count', ...auth, controller.unreadCount);
  router.post('/read-all', ...auth, controller.markAllRead);

  router.get('/devices', ...auth, controller.listDevices);
  router.post(
    '/devices',
    ...auth,
    validate({ body: registerDeviceSchema }),
    controller.registerDevice,
  );
  router.patch(
    '/devices/:deviceId',
    ...auth,
    validate({ params: deviceIdParamSchema, body: updateDeviceSchema }),
    controller.updateDevice,
  );
  router.delete(
    '/devices/:deviceId',
    ...auth,
    validate({ params: deviceIdParamSchema }),
    controller.deactivateDevice,
  );

  router.get('/preferences', ...auth, controller.getPreferences);
  router.patch(
    '/preferences',
    ...auth,
    validate({ body: updatePreferencesSchema }),
    controller.updatePreferences,
  );

  router.get(
    '/:notificationId',
    ...auth,
    validate({ params: notificationIdParamSchema }),
    controller.get,
  );
  router.post(
    '/:notificationId/read',
    ...auth,
    validate({ params: notificationIdParamSchema }),
    controller.markRead,
  );

  return router;
}
