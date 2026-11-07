import { Router } from 'express';

import { Permission } from '../../common/authz/permissions.js';
import { authenticate, requireActiveAccount } from '../../common/middleware/authenticate.js';
import { requirePermission } from '../../common/middleware/authorize.js';
import { otpRateLimiter } from '../../common/middleware/rate-limit.js';
import { validate } from '../../common/middleware/validate.js';
import type { AdminController } from './module.controller.js';
import {
  acceptInvitationSchema,
  adminMfaConfirmSchema,
  adminMfaVerifySchema,
  adminOtpRequestSchema,
  adminOtpVerifySchema,
  bootstrapAdminSchema,
  createInvitationSchema,
  reinstateUserSchema,
  revokeAdminSchema,
  suspendUserSchema,
} from './module.schema.js';

export function createAdminRouter(controller: AdminController): Router {
  const router = Router();

  router.post('/bootstrap', validate({ body: bootstrapAdminSchema }), controller.bootstrap);

  router.post(
    '/invitations/accept',
    validate({ body: acceptInvitationSchema }),
    controller.acceptInvitation,
  );

  router.post(
    '/auth/otp',
    otpRateLimiter,
    validate({ body: adminOtpRequestSchema }),
    controller.requestOtp,
  );
  router.post(
    '/auth/otp/verify',
    otpRateLimiter,
    validate({ body: adminOtpVerifySchema }),
    controller.verifyOtp,
  );
  router.post('/auth/mfa/verify', validate({ body: adminMfaVerifySchema }), controller.verifyMfa);

  router.post('/mfa/enroll/start', controller.startMfaEnrollment);
  router.post(
    '/mfa/enroll/confirm',
    validate({ body: adminMfaConfirmSchema }),
    controller.confirmMfaEnrollment,
  );

  router.post(
    '/invitations',
    authenticate,
    requireActiveAccount,
    requirePermission(Permission.ManageAdmins),
    validate({ body: createInvitationSchema }),
    controller.createInvitation,
  );

  router.post(
    '/grants/revoke',
    authenticate,
    requireActiveAccount,
    requirePermission(Permission.ManageAdmins),
    validate({ body: revokeAdminSchema }),
    controller.revokeAdmin,
  );

  router.post(
    '/users/suspend',
    authenticate,
    requireActiveAccount,
    requirePermission(Permission.SuspendReinstateRiders),
    validate({ body: suspendUserSchema }),
    controller.suspendUser,
  );

  router.post(
    '/users/reinstate',
    authenticate,
    requireActiveAccount,
    requirePermission(Permission.SuspendReinstateRiders),
    validate({ body: reinstateUserSchema }),
    controller.reinstateUser,
  );

  router.get(
    '/me',
    authenticate,
    requireActiveAccount,
    requirePermission(Permission.ViewAdminProfile),
    controller.getMe,
  );

  return router;
}
