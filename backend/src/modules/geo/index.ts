import { Router } from 'express';

import type { ModuleDeps } from '../../common/types/module-deps.js';
import type { AuditService } from '../audit/module.service.js';
import { GeoImportServiceImpl, type GeoImportService } from './import.service.js';
import { GeoController } from './module.controller.js';
import { GeoPrismaRepository } from './module.repository.js';
import { createGeoRouter } from './module.routes.js';
import { GeoServiceImpl, type GeoService } from './module.service.js';

export interface GeoModule {
  service: GeoService;
  imports: GeoImportService;
  /** Mount at `/admin/geo`. */
  router: Router;
}

export function createGeoModule(deps: ModuleDeps & { audit: AuditService }): GeoModule {
  const repository = new GeoPrismaRepository(deps.prisma);
  const service = new GeoServiceImpl(repository, { audit: deps.audit });
  const imports = new GeoImportServiceImpl(repository, { audit: deps.audit });
  const controller = new GeoController(service, imports);
  return { service, imports, router: createGeoRouter(controller) };
}

export type { GeoService, GeoImportService };
