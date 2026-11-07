import type { RequestHandler } from 'express';

import { AppError } from '../../common/errors/app-error.js';
import { sendSuccess } from '../../common/http/response.js';
import type {
  CreateVehicleInput,
  DocumentKind,
  ReviewRiderInput,
  ReviewVehicleInput,
  StartRiderOnboardingInput,
  UpdateAvailabilityInput,
  UpdateRiderOnboardingInput,
  UpdateVehicleInput,
} from './module.schema.js';
import type { RidersService } from './module.service.js';

export class RidersController {
  constructor(private readonly service: RidersService) {}

  startOnboarding: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as StartRiderOnboardingInput;
      const data = await this.service.startOnboarding(req.auth!.sub, body, req.ip);
      sendSuccess(res, data, 201);
    } catch (error) {
      next(error);
    }
  };

  updateOnboarding: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as UpdateRiderOnboardingInput;
      const data = await this.service.updateOnboarding(req.auth!.sub, body, req.ip);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  getMyApplication: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.getMyApplication(req.auth!.sub);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  createVehicle: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as CreateVehicleInput;
      const data = await this.service.createVehicle(req.auth!.sub, body, req.ip);
      sendSuccess(res, data, 201);
    } catch (error) {
      next(error);
    }
  };

  updateVehicle: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as UpdateVehicleInput;
      const data = await this.service.updateVehicle(
        req.auth!.sub,
        req.params.vehicleId as string,
        body,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  uploadDocument: RequestHandler = async (req, res, next) => {
    try {
      const kind = (req.body?.kind ?? req.query.kind) as DocumentKind;
      const vehicleId = (req.body?.vehicleId ?? req.query.vehicleId) as string | undefined;
      const file = req.file;
      if (!file) {
        next(
          new AppError({
            status: 400,
            code: 'VALIDATION_ERROR',
            message: 'Document file is required',
          }),
        );
        return;
      }
      const data = await this.service.uploadDocument(
        req.auth!.sub,
        {
          kind,
          vehicleId: vehicleId || undefined,
          contentType: file.mimetype,
          body: file.buffer,
        },
        req.ip,
      );
      sendSuccess(res, data, 201);
    } catch (error) {
      next(error);
    }
  };

  submitApplication: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.submitApplication(req.auth!.sub, req.ip);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  listPending: RequestHandler = async (_req, res, next) => {
    try {
      const data = await this.service.listPendingForOps();
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  getApplication: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.getApplicationForOps(req.params.riderId as string);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  openDocument: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.openDocumentForOps(
        req.auth!.sub,
        req.params.documentId as string,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  revealGhanaCard: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.revealGhanaCardForOps(
        req.auth!.sub,
        req.params.riderId as string,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  reviewApplication: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as ReviewRiderInput;
      const data = await this.service.reviewApplication(
        req.auth!.sub,
        req.params.riderId as string,
        body,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  reviewVehicle: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as ReviewVehicleInput;
      const data = await this.service.reviewVehicle(
        req.auth!.sub,
        req.params.vehicleId as string,
        body,
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  setAvailability: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as UpdateAvailabilityInput;
      const data = await this.service.setAvailability(req.auth!.sub, body, req.ip);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  getOperationalEligibility: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.getOperationalEligibility(req.auth!.sub);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };
}
