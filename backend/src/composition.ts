import type { ModuleDeps } from './common/types/module-deps.js';
import { createAdminModule } from './modules/admin/index.js';
import { createAuditModule } from './modules/audit/index.js';
import { createAuthModule } from './modules/auth/index.js';
import { createBookingsModule } from './modules/bookings/index.js';
import { createDisputesModule } from './modules/disputes/index.js';
import { createGeoModule } from './modules/geo/index.js';
import { createLocationsModule } from './modules/locations/index.js';
import { createMapsModule } from './modules/maps/index.js';
import { createMatchingModule } from './modules/matching/index.js';
import { createNotificationsModule } from './modules/notifications/index.js';
import { createPaymentsModule } from './modules/payments/index.js';
import { createRidersModule } from './modules/riders/index.js';
import { createServiceZonesModule } from './modules/service-zones/index.js';
import { createUsersModule } from './modules/users/index.js';
import { createWalletModule } from './modules/wallet/index.js';

export function createModules(deps: ModuleDeps) {
  const audit = createAuditModule(deps);
  const bookings = createBookingsModule({ ...deps, audit: audit.service });
  const matching = createMatchingModule({
    ...deps,
    audit: audit.service,
    bookings: bookings.service,
  });
  const disputes = createDisputesModule({
    ...deps,
    audit: audit.service,
    bookings: bookings.service,
  });
  const wallet = createWalletModule({ ...deps, audit: audit.service });
  const maps = createMapsModule(deps);
  return {
    auth: createAuthModule(deps),
    users: createUsersModule({ ...deps, audit: audit.service }),
    riders: createRidersModule({ ...deps, audit: audit.service }),
    bookings,
    matching,
    disputes,
    locations: createLocationsModule({ ...deps, audit: audit.service }),
    maps,
    payments: createPaymentsModule({
      ...deps,
      audit: audit.service,
      bookings: bookings.service,
      matching: matching.service,
      wallet: wallet.service,
    }),
    wallet,
    notifications: createNotificationsModule(deps),
    admin: createAdminModule({ ...deps, audit: audit.service }),
    serviceZones: createServiceZonesModule({ ...deps, audit: audit.service }),
    geo: createGeoModule({ ...deps, audit: audit.service }),
    audit,
  };
}
