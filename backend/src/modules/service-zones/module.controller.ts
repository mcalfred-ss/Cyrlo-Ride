import type { RequestHandler } from 'express';

import { sendSuccess } from '../../common/http/response.js';
import type {
  AssignRiderZoneInput,
  CreateServiceZoneInput,
  ListServiceZonesQuery,
  RejectOrRevokeZoneInput,
  UpdateServiceZoneInput,
} from './module.schema.js';
import type { ServiceZonesService } from './module.service.js';

export class ServiceZonesController {
  constructor(private readonly service: ServiceZonesService) {}

  create: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as CreateServiceZoneInput;
      const data = await this.service.createZone(req.auth!.sub, body, req.ip);
      sendSuccess(res, data, 201);
    } catch (error) {
      next(error);
    }
  };

  list: RequestHandler = async (_req, res, next) => {
    try {
      const query = res.locals.validated.query as ListServiceZonesQuery;
      const result = (await this.service.listZones(query)) as {
        items: unknown;
        meta: Record<string, unknown>;
      };
      sendSuccess(res, result.items, 200, result.meta);
    } catch (error) {
      next(error);
    }
  };

  get: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.getZone(req.params.zoneId as string);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  update: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as UpdateServiceZoneInput;
      const data = await this.service.updateZone(
        req.auth!.sub,
        req.params.zoneId as string,
        body,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  activate: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.activateZone(
        req.auth!.sub,
        req.params.zoneId as string,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  submitReview: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.submitReview(
        req.auth!.sub,
        req.params.zoneId as string,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  verify: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.verifyBoundary(
        req.auth!.sub,
        req.params.zoneId as string,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  lock: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.lockZone(
        req.auth!.sub,
        req.params.zoneId as string,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  suspend: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.suspendZone(
        req.auth!.sub,
        req.params.zoneId as string,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  deactivate: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.deactivateZone(
        req.auth!.sub,
        req.params.zoneId as string,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  assignRider: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as AssignRiderZoneInput;
      const data = await this.service.assignRider(
        req.auth!.sub,
        req.params.zoneId as string,
        body,
        req.ip,
      );
      sendSuccess(res, data, 201);
    } catch (error) {
      next(error);
    }
  };

  listZoneRiders: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.listZoneRiders(req.params.zoneId as string);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  approve: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.approveRiderZone(
        req.auth!.sub,
        req.params.approvalId as string,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  reject: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as RejectOrRevokeZoneInput;
      const data = await this.service.rejectRiderZone(
        req.auth!.sub,
        req.params.approvalId as string,
        body,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  revoke: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as RejectOrRevokeZoneInput;
      const data = await this.service.revokeRiderZone(
        req.auth!.sub,
        req.params.approvalId as string,
        body,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  listRiderZones: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.listRiderZones(req.params.riderId as string);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  listRiderZoneHistory: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.listRiderZoneHistory(req.params.riderId as string);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };
}
