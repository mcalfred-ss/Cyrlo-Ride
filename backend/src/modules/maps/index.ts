import type { ModuleDeps } from '../../common/types/module-deps.js';
import { env } from '../../config/env.js';
import { resolveMapboxPublicToken } from '../../infrastructure/maps/mapbox-public-token.js';
import { createMapsProviderFromEnv } from '../../infrastructure/maps/maps.provider.js';
import { MapsController } from './module.controller.js';
import { createMapsRouter } from './module.routes.js';
import { MapsService } from './module.service.js';

export function createMapsModule(_deps: ModuleDeps) {
  const provider = createMapsProviderFromEnv();
  const service = new MapsService(
    provider.client,
    resolveMapboxPublicToken(env),
  );
  const controller = new MapsController(service);
  return {
    router: createMapsRouter(controller),
    service,
    provider,
  };
}
