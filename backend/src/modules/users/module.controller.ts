import type { RequestHandler } from 'express';

import { sendSuccess } from '../../common/http/response.js';
import type { UpdatePassengerProfileInput } from './module.schema.js';
import type { UsersService } from './module.service.js';

export class UsersController {
  constructor(private readonly service: UsersService) {}

  getMe: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.getMe(req.auth!.sub);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  updateMe: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as UpdatePassengerProfileInput;
      const data = await this.service.updatePassengerProfile(req.auth!.sub, body, req.ip);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  deleteMe: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.deleteMe(req.auth!.sub, req.ip);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };
}
