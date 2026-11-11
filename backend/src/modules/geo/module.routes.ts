import { Router, type RequestHandler } from 'express';

import type { Permission } from '../../common/authz/permissions.js';
import { authenticate, requireActiveAccount } from '../../common/middleware/authenticate.js';
import { requireAnyPermission, requirePermission } from '../../common/middleware/authorize.js';
import { validate } from '../../common/middleware/validate.js';
import type { GeoController } from './module.controller.js';
import {
  GEO_COMMUNITY_WRITE_PERMISSIONS,
  GEO_HIERARCHY_WRITE_PERMISSIONS,
  GEO_IMPORT_PERMISSIONS,
  GEO_READ_PERMISSIONS,
} from './module.permissions.js';
import {
  createCommunitySchema,
  createCountrySchema,
  createDistrictSchema,
  createRegionSchema,
  geoIdParamSchema,
  geoTreeQuerySchema,
  importConfirmSchema,
  importPreviewSchema,
  listCommunitiesQuerySchema,
  listCountriesQuerySchema,
  listDistrictsQuerySchema,
  listRegionsQuerySchema,
  updateCommunitySchema,
  updateCountrySchema,
  updateDistrictSchema,
  updateRegionSchema,
} from './module.schema.js';

function guard(permissions: readonly Permission[]): RequestHandler[] {
  const [first, ...rest] = permissions;
  const authorize =
    first !== undefined && rest.length === 0
      ? requirePermission(first)
      : requireAnyPermission(...permissions);
  return [authenticate, requireActiveAccount, authorize];
}

/** Mounted under `/admin/geo`. Static segments are registered before `/:id`. */
export function createGeoRouter(controller: GeoController): Router {
  const router = Router();
  const read = guard(GEO_READ_PERMISSIONS);
  const writeHierarchy = guard(GEO_HIERARCHY_WRITE_PERMISSIONS);
  const writeCommunity = guard(GEO_COMMUNITY_WRITE_PERMISSIONS);
  const importAccess = guard(GEO_IMPORT_PERMISSIONS);
  const idParams = { params: geoIdParamSchema };

  // Hierarchy browser
  router.get('/tree', ...read, validate({ query: geoTreeQuerySchema }), controller.tree);

  // Import
  router.post(
    '/imports/preview',
    ...importAccess,
    validate({ body: importPreviewSchema }),
    controller.previewImport,
  );
  router.post(
    '/imports/confirm',
    ...importAccess,
    validate({ body: importConfirmSchema }),
    controller.confirmImport,
  );

  // Regions
  router.get('/regions', ...read, validate({ query: listRegionsQuerySchema }), controller.listRegions);
  router.post(
    '/regions',
    ...writeHierarchy,
    validate({ body: createRegionSchema }),
    controller.createRegion,
  );
  router.get('/regions/:id', ...read, validate(idParams), controller.getRegion);
  router.patch(
    '/regions/:id',
    ...writeHierarchy,
    validate({ ...idParams, body: updateRegionSchema }),
    controller.updateRegion,
  );

  // Districts
  router.get(
    '/districts',
    ...read,
    validate({ query: listDistrictsQuerySchema }),
    controller.listDistricts,
  );
  router.post(
    '/districts',
    ...writeHierarchy,
    validate({ body: createDistrictSchema }),
    controller.createDistrict,
  );
  router.get('/districts/:id', ...read, validate(idParams), controller.getDistrict);
  router.patch(
    '/districts/:id',
    ...writeHierarchy,
    validate({ ...idParams, body: updateDistrictSchema }),
    controller.updateDistrict,
  );

  // Communities
  router.get(
    '/communities',
    ...read,
    validate({ query: listCommunitiesQuerySchema }),
    controller.listCommunities,
  );
  router.post(
    '/communities',
    ...writeCommunity,
    validate({ body: createCommunitySchema }),
    controller.createCommunity,
  );
  router.get('/communities/:id', ...read, validate(idParams), controller.getCommunity);
  router.patch(
    '/communities/:id',
    ...writeCommunity,
    validate({ ...idParams, body: updateCommunitySchema }),
    controller.updateCommunity,
  );

  // Countries (root of the mount)
  router.get('/', ...read, validate({ query: listCountriesQuerySchema }), controller.listCountries);
  router.post(
    '/',
    ...writeHierarchy,
    validate({ body: createCountrySchema }),
    controller.createCountry,
  );
  router.get('/:id', ...read, validate(idParams), controller.getCountry);
  router.patch(
    '/:id',
    ...writeHierarchy,
    validate({ ...idParams, body: updateCountrySchema }),
    controller.updateCountry,
  );

  return router;
}
