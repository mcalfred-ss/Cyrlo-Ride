import type { RequestHandler } from 'express';

import { sendSuccess } from '../../common/http/response.js';
import type {
  LogoutInput,
  RefreshSessionInput,
  RequestOtpInput,
  VerifyOtpInput,
} from './module.schema.js';
import type { AuthService } from './module.service.js';

export class AuthController {
  constructor(private readonly service: AuthService) {}

  requestOtp: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as RequestOtpInput;
      const data = await this.service.requestOtp(body);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  verifyOtp: RequestHandler = async (_req, res, next) => {
    try {
      const body = res.locals.validated.body as VerifyOtpInput;
      const data = await this.service.verifyOtp(body);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  refresh: RequestHandler = async (_req, res, next) => {
    try {
      const body = res.locals.validated.body as RefreshSessionInput;
      const data = await this.service.refresh(body);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  logout: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as LogoutInput;
      const data = await this.service.logout(body, req.auth!.sub);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };
}
