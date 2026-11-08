import type { RequestHandler } from 'express';

import { sendSuccess } from '../../common/http/response.js';
import type { MapsService } from './module.service.js';

export class MapsController {
  constructor(private readonly service: MapsService) {}

  config: RequestHandler = async (_req, res, next) => {
    try {
      sendSuccess(res, await this.service.config());
    } catch (error) {
      next(error);
    }
  };

  geocode: RequestHandler = async (req, res, next) => {
    try {
      sendSuccess(res, await this.service.geocode(req.body));
    } catch (error) {
      next(error);
    }
  };

  reverse: RequestHandler = async (req, res, next) => {
    try {
      sendSuccess(res, await this.service.reverse(req.body));
    } catch (error) {
      next(error);
    }
  };

  places: RequestHandler = async (req, res, next) => {
    try {
      sendSuccess(res, await this.service.places(req.body));
    } catch (error) {
      next(error);
    }
  };

  route: RequestHandler = async (req, res, next) => {
    try {
      sendSuccess(res, await this.service.route(req.body));
    } catch (error) {
      next(error);
    }
  };

  estimate: RequestHandler = async (req, res, next) => {
    try {
      sendSuccess(res, await this.service.estimate(req.body));
    } catch (error) {
      next(error);
    }
  };
}
