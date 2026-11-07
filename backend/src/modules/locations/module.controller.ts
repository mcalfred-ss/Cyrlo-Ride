import type { RequestHandler } from 'express';

import { sendSuccess } from '../../common/http/response.js';
import type { UpdateLocationInput } from './module.schema.js';
import type { LocationsService } from './module.service.js';

export class LocationsController {
  constructor(private readonly service: LocationsService) {}

  updateOwn: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as UpdateLocationInput;
      const data = await this.service.updateOwnLocation(req.auth!.sub, body, req.ip);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  stopSharing: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.stopSharing(req.auth!.sub, req.ip);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  getOwn: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.getOwnLocation(req.auth!.sub);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  getEligibility: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.evaluateEligibility(req.auth!.sub, {
        requireOnline: true,
      });
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  getStaffLocation: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.getRiderLocationForStaff(
        req.auth!.sub,
        req.params.riderId as string,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };
}
