import type { ModuleDeps } from '../../common/types/module-deps.js';
import { createMapsProviderFromEnv } from '../../infrastructure/maps/maps.provider.js';
import { MapsController } from './module.controller.js';
import { createMapsRouter } from './module.routes.js';
import { MapsService } from './module.service.js';

export function createMapsModule(_deps: ModuleDeps) {
  const provider = createMapsProviderFromEnv();
  const service = new MapsService(provider.client);
  const controller = new MapsController(service);
  return {
    router: createMapsRouter(controller),
    service,
    provider,
  };
}
