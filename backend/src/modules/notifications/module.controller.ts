import type { RequestHandler } from 'express';

import { sendSuccess } from '../../common/http/response.js';
import type {
  ListNotificationsQuery,
  RegisterDeviceInput,
  UpdateDeviceInput,
  UpdatePreferencesInput,
} from './module.schema.js';
import type { NotificationsService } from './module.service.js';

export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  list: RequestHandler = async (req, res, next) => {
    try {
      const query = res.locals.validated.query as ListNotificationsQuery;
      sendSuccess(res, await this.service.listMine(req.auth!.sub, query));
    } catch (error) {
      next(error);
    }
  };

  get: RequestHandler = async (req, res, next) => {
    try {
      sendSuccess(
        res,
        await this.service.getMine(req.auth!.sub, req.params.notificationId as string),
      );
    } catch (error) {
      next(error);
    }
  };

  markRead: RequestHandler = async (req, res, next) => {
    try {
      sendSuccess(
        res,
        await this.service.markRead(req.auth!.sub, req.params.notificationId as string),
      );
    } catch (error) {
      next(error);
    }
  };

  markAllRead: RequestHandler = async (req, res, next) => {
    try {
      sendSuccess(res, await this.service.markAllRead(req.auth!.sub));
    } catch (error) {
      next(error);
    }
  };

  unreadCount: RequestHandler = async (req, res, next) => {
    try {
      sendSuccess(res, await this.service.unreadCount(req.auth!.sub));
    } catch (error) {
      next(error);
    }
  };

  registerDevice: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as RegisterDeviceInput;
      sendSuccess(res, await this.service.registerDevice(req.auth!.sub, body), 201);
    } catch (error) {
      next(error);
    }
  };

  updateDevice: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as UpdateDeviceInput;
      sendSuccess(
        res,
        await this.service.updateDevice(req.auth!.sub, req.params.deviceId as string, body),
      );
    } catch (error) {
      next(error);
    }
  };

  deactivateDevice: RequestHandler = async (req, res, next) => {
    try {
      sendSuccess(
        res,
        await this.service.deactivateDevice(req.auth!.sub, req.params.deviceId as string),
      );
    } catch (error) {
      next(error);
    }
  };

  listDevices: RequestHandler = async (req, res, next) => {
    try {
      sendSuccess(res, await this.service.listDevices(req.auth!.sub));
    } catch (error) {
      next(error);
    }
  };

  getPreferences: RequestHandler = async (req, res, next) => {
    try {
      sendSuccess(res, await this.service.getPreferences(req.auth!.sub));
    } catch (error) {
      next(error);
    }
  };

  updatePreferences: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated.body as UpdatePreferencesInput;
      sendSuccess(res, await this.service.updatePreferences(req.auth!.sub, body));
    } catch (error) {
      next(error);
    }
  };
}
