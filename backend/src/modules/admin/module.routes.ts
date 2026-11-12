import { Router } from 'express';

import { Permission } from '../../common/authz/permissions.js';
import { authenticate, requireActiveAccount } from '../../common/middleware/authenticate.js';
import {
  requireAnyPermission,
  requirePermission,
} from '../../common/middleware/authorize.js';
import { otpRateLimiter } from '../../common/middleware/rate-limit.js';
import { validate } from '../../common/middleware/validate.js';
import { paginationQuerySchema } from '../../common/utils/pagination.js';
import type { AdminConsoleController } from './console.controller.js';
import {
  adminBookingIdParamSchema,
  analyticsQuerySchema,
  listAdminBookingsQuerySchema,
  listAuditLogsQuerySchema,
  listPassengersQuerySchema,
  passengerIdParamSchema,
} from './console.schema.js';
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

/** Permission required for passenger list/get (not suspend). Exported for tests. */
export const PASSENGER_DIRECTORY_PERMISSION = Permission.ViewBookingHistory;

/**
 * Ordinary booking-history endpoints never include exact lat/lng.
 * Precise location remains a separate product/security decision (e.g. trip-gps).
 */
export const ORDINARY_BOOKING_HISTORY_INCLUDES_EXACT_COORDINATES = false;

export function createAdminRouter(
  controller: AdminController,
  consoleController: AdminConsoleController,
): Router {
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

  router.get(
    '/analytics',
    authenticate,
    requireActiveAccount,
    requireAnyPermission(
      Permission.MonitorOperations,
      Permission.ViewFinancialReports,
      Permission.InvestigateDisputes,
      Permission.ViewPayments,
    ),
    validate({ query: analyticsQuerySchema }),
    consoleController.analytics,
  );

  router.get(
    '/financial-reports',
    authenticate,
    requireActiveAccount,
    requirePermission(Permission.ViewFinancialReports),
    validate({ query: analyticsQuerySchema }),
    consoleController.financialReport,
  );

  /**
   * Passenger directory/detail: ViewBookingHistory only.
   * SuspendReinstateRiders remains on suspend/reinstate mutations — not directory browse.
   */
  router.get(
    '/passengers',
    authenticate,
    requireActiveAccount,
    requirePermission(Permission.ViewBookingHistory),
    validate({ query: listPassengersQuerySchema }),
    consoleController.listPassengers,
  );

  router.get(
    '/passengers/:passengerId',
    authenticate,
    requireActiveAccount,
    requirePermission(Permission.ViewBookingHistory),
    validate({ params: passengerIdParamSchema }),
    consoleController.getPassenger,
  );

  router.get(
    '/passengers/:passengerId/bookings',
    authenticate,
    requireActiveAccount,
    requirePermission(Permission.ViewBookingHistory),
    validate({ params: passengerIdParamSchema, query: paginationQuerySchema }),
    consoleController.listPassengerBookings,
  );

  router.get(
    '/passengers/:passengerId/cancellations',
    authenticate,
    requireActiveAccount,
    requirePermission(Permission.ViewBookingHistory),
    validate({ params: passengerIdParamSchema, query: paginationQuerySchema }),
    consoleController.listPassengerCancellations,
  );

  router.get(
    '/bookings',
    authenticate,
    requireActiveAccount,
    requirePermission(Permission.ViewBookingHistory),
    validate({ query: listAdminBookingsQuerySchema }),
    consoleController.listBookings,
  );

  router.get(
    '/bookings/:bookingId',
    authenticate,
    requireActiveAccount,
    requirePermission(Permission.ViewBookingHistory),
    validate({ params: adminBookingIdParamSchema }),
    consoleController.getBooking,
  );

  router.get(
    '/audit-logs',
    authenticate,
    requireActiveAccount,
    requirePermission(Permission.ManageAdmins),
    validate({ query: listAuditLogsQuerySchema }),
    consoleController.listAuditLogs,
  );

  return router;
}
