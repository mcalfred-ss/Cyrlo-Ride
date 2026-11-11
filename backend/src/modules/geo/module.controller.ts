import type { RequestHandler, Response } from 'express';

import { sendSuccess } from '../../common/http/response.js';
import type { GeoImportService } from './import.service.js';
import type {
  CreateCommunityInput,
  CreateCountryInput,
  CreateDistrictInput,
  CreateRegionInput,
  GeoTreeQuery,
  ImportConfirmInput,
  ImportPreviewInput,
  ListCommunitiesQuery,
  ListCountriesQuery,
  ListDistrictsQuery,
  ListRegionsQuery,
  UpdateCommunityInput,
  UpdateCountryInput,
  UpdateDistrictInput,
  UpdateRegionInput,
} from './module.schema.js';
import type { GeoService, ListResult } from './module.service.js';

function body<T>(res: Response): T {
  return res.locals.validated.body as T;
}
function query<T>(res: Response): T {
  return res.locals.validated.query as T;
}

function sendList<T>(res: Response, result: ListResult<T>): void {
  sendSuccess(res, result.items, 200, result.meta);
}

export class GeoController {
  constructor(
    private readonly service: GeoService,
    private readonly imports: GeoImportService,
  ) {}

  // ---- Countries ----
  listCountries: RequestHandler = async (_req, res, next) => {
    try {
      sendList(res, await this.service.listCountries(query<ListCountriesQuery>(res)));
    } catch (error) {
      next(error);
    }
  };
  getCountry: RequestHandler = async (req, res, next) => {
    try {
      sendSuccess(res, await this.service.getCountry(req.params.id as string));
    } catch (error) {
      next(error);
    }
  };
  createCountry: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.createCountry(
        req.auth!.sub,
        body<CreateCountryInput>(res),
        req.ip,
      );
      sendSuccess(res, data, 201);
    } catch (error) {
      next(error);
    }
  };
  updateCountry: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.updateCountry(
        req.auth!.sub,
        req.params.id as string,
        body<UpdateCountryInput>(res),
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  // ---- Regions ----
  listRegions: RequestHandler = async (_req, res, next) => {
    try {
      sendList(res, await this.service.listRegions(query<ListRegionsQuery>(res)));
    } catch (error) {
      next(error);
    }
  };
  getRegion: RequestHandler = async (req, res, next) => {
    try {
      sendSuccess(res, await this.service.getRegion(req.params.id as string));
    } catch (error) {
      next(error);
    }
  };
  createRegion: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.createRegion(
        req.auth!.sub,
        body<CreateRegionInput>(res),
        req.ip,
      );
      sendSuccess(res, data, 201);
    } catch (error) {
      next(error);
    }
  };
  updateRegion: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.updateRegion(
        req.auth!.sub,
        req.params.id as string,
        body<UpdateRegionInput>(res),
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  // ---- Districts ----
  listDistricts: RequestHandler = async (_req, res, next) => {
    try {
      sendList(res, await this.service.listDistricts(query<ListDistrictsQuery>(res)));
    } catch (error) {
      next(error);
    }
  };
  getDistrict: RequestHandler = async (req, res, next) => {
    try {
      sendSuccess(res, await this.service.getDistrict(req.params.id as string));
    } catch (error) {
      next(error);
    }
  };
  createDistrict: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.createDistrict(
        req.auth!.sub,
        body<CreateDistrictInput>(res),
        req.ip,
      );
      sendSuccess(res, data, 201);
    } catch (error) {
      next(error);
    }
  };
  updateDistrict: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.updateDistrict(
        req.auth!.sub,
        req.params.id as string,
        body<UpdateDistrictInput>(res),
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  // ---- Communities ----
  listCommunities: RequestHandler = async (_req, res, next) => {
    try {
      sendList(res, await this.service.listCommunities(query<ListCommunitiesQuery>(res)));
    } catch (error) {
      next(error);
    }
  };
  getCommunity: RequestHandler = async (req, res, next) => {
    try {
      sendSuccess(res, await this.service.getCommunity(req.params.id as string));
    } catch (error) {
      next(error);
    }
  };
  createCommunity: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.createCommunity(
        req.auth!.sub,
        body<CreateCommunityInput>(res),
        req.ip,
      );
      sendSuccess(res, data, 201);
    } catch (error) {
      next(error);
    }
  };
  updateCommunity: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.updateCommunity(
        req.auth!.sub,
        req.params.id as string,
        body<UpdateCommunityInput>(res),
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };

  // ---- Tree ----
  tree: RequestHandler = async (_req, res, next) => {
    try {
      sendSuccess(res, await this.service.getTree(query<GeoTreeQuery>(res)));
    } catch (error) {
      next(error);
    }
  };

  // ---- Import ----
  previewImport: RequestHandler = async (_req, res, next) => {
    try {
      sendSuccess(res, await this.imports.preview(body<ImportPreviewInput>(res)));
    } catch (error) {
      next(error);
    }
  };
  confirmImport: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.imports.confirm(
        req.auth!.sub,
        body<ImportConfirmInput>(res),
        req.ip,
      );
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  };
}
