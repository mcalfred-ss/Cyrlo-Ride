import type { ModuleDeps } from './common/types/module-deps.js';
import { createAdminModule } from './modules/admin/index.js';
import { createAuditModule } from './modules/audit/index.js';
import { createAuthModule } from './modules/auth/index.js';
import { createBookingsModule } from './modules/bookings/index.js';
import { createLocationsModule } from './modules/locations/index.js';
import { createMatchingModule } from './modules/matching/index.js';
import { createNotificationsModule } from './modules/notifications/index.js';
import { createPaymentsModule } from './modules/payments/index.js';
import { createRidersModule } from './modules/riders/index.js';
import { createServiceZonesModule } from './modules/service-zones/index.js';
import { createUsersModule } from './modules/users/index.js';
import { createWalletModule } from './modules/wallet/index.js';

export function createModules(deps: ModuleDeps) {
  return {
    auth: createAuthModule(deps),
    users: createUsersModule(deps),
    riders: createRidersModule(deps),
    bookings: createBookingsModule(deps),
    matching: createMatchingModule(deps),
    locations: createLocationsModule(deps),
    payments: createPaymentsModule(deps),
    wallet: createWalletModule(deps),
    notifications: createNotificationsModule(deps),
    admin: createAdminModule(deps),
    serviceZones: createServiceZonesModule(deps),
    audit: createAuditModule(deps),
  };
}
