import type { RequestHandler } from 'express';

import { sendSuccess } from '../../common/http/response.js';
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
}
