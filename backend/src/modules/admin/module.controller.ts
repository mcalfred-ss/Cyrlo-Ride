import type { RequestHandler } from 'express';

import { sendSuccess } from '../../common/http/response.js';
import type {
  AcceptInvitationInput,
  AdminMfaConfirmInput,
  AdminMfaVerifyInput,
  AdminOtpRequestInput,
  AdminOtpVerifyInput,
  BootstrapAdminInput,
  CreateInvitationInput,
  ReinstateUserInput,
  RevokeAdminInput,
  SuspendUserInput,
} from './module.schema.js';
import type { AdminService } from './module.service.js';

export class AdminController {
  constructor(private readonly service: AdminService) {}

  bootstrap: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as BootstrapAdminInput;
      const data = await this.service.bootstrap(body, req.ip);
      sendSuccess(res, data, 201);
    } catch (error) {
      next(error);
    }
  };

  createInvitation: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as CreateInvitationInput;
      const data = await this.service.createInvitation(
        body,
        { userId: req.staff!.userId, staffRole: req.staff!.staffRole },
        req.ip,
      );
      sendSuccess(res, data, 201);
    } catch (error) {
      next(error);
    }
  };

  acceptInvitation: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as AcceptInvitationInput;
      const data = await this.service.acceptInvitation(body, req.ip);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  requestOtp: RequestHandler = async (_req, res, next) => {
    try {
      const body = res.locals.validated.body as AdminOtpRequestInput;
      const data = await this.service.requestAdminOtp(body);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  verifyOtp: RequestHandler = async (_req, res, next) => {
    try {
      const body = res.locals.validated.body as AdminOtpVerifyInput;
      const data = await this.service.verifyAdminOtp(body);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  startMfaEnrollment: RequestHandler = async (req, res, next) => {
    try {
      const header = req.header('authorization');
      const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
      const data = await this.service.startMfaEnrollment(token);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  confirmMfaEnrollment: RequestHandler = async (req, res, next) => {
    try {
      const header = req.header('authorization');
      const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
      const body = res.locals.validated.body as AdminMfaConfirmInput;
      const data = await this.service.confirmMfaEnrollment(token, body, req.ip);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  verifyMfa: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as AdminMfaVerifyInput;
      const data = await this.service.verifyMfa(body, req.ip);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  revokeAdmin: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as RevokeAdminInput;
      const data = await this.service.revokeAdmin(
        body,
        { userId: req.staff!.userId, staffRole: req.staff!.staffRole },
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  suspendUser: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as SuspendUserInput;
      const data = await this.service.suspendUser(
        body,
        { userId: req.staff!.userId, staffRole: req.staff!.staffRole },
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  reinstateUser: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as ReinstateUserInput;
      const data = await this.service.reinstateUser(
        body,
        { userId: req.staff!.userId, staffRole: req.staff!.staffRole },
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  getMe: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.getMe(req.auth!.sub);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };
}
