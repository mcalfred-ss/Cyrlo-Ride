import {
  activateServiceZone,
  deactivateServiceZone,
  lockServiceZone,
  submitZoneReview,
  suspendServiceZone,
  verifyServiceZone,
} from '../../api/admin-zones';
import type { AdminServiceZone } from '../../api/types';
import { Permission } from '../../config/permissions';

export interface ZoneAction {
  id: string;
  label: string;
  description: string;
  permission: Permission;
  danger?: boolean;
  visible: (zone: AdminServiceZone) => boolean;
  run: (zoneId: string) => Promise<AdminServiceZone>;
}

/** Zone lifecycle actions; every one calls the real backend endpoint. */
export const ZONE_ACTIONS: readonly ZoneAction[] = [
  {
    id: 'submit-review',
    label: 'Submit for review',
    description: 'Moves a DRAFT zone to UNDER_REVIEW. Boundary edits are no longer allowed after this.',
    permission: Permission.ManageServiceZones,
    visible: (z) => z.status === 'DRAFT',
    run: submitZoneReview,
  },
  {
    id: 'verify',
    label: 'Verify boundary',
    description: 'Marks the boundary as VERIFIED. An UNDER_REVIEW zone becomes LOCKED.',
    permission: Permission.VerifyServiceZones,
    visible: (z) => z.boundaryVerificationStatus !== 'VERIFIED' || z.status === 'UNDER_REVIEW',
    run: verifyServiceZone,
  },
  {
    id: 'lock',
    label: 'Lock',
    description: 'Locks the zone and deactivates it. Bookings will not be served here.',
    permission: Permission.ManageServiceZones,
    danger: true,
    visible: (z) => z.status !== 'LOCKED',
    run: lockServiceZone,
  },
  {
    id: 'activate',
    label: 'Activate',
    description: 'Makes the zone live for bookings. Requires a verified boundary and active geography.',
    permission: Permission.ManageServiceZones,
    visible: (z) => z.status !== 'ACTIVE' && z.status !== 'DRAFT',
    run: activateServiceZone,
  },
  {
    id: 'suspend',
    label: 'Suspend',
    description: 'Temporarily stops serving bookings in this active zone.',
    permission: Permission.ManageServiceZones,
    danger: true,
    visible: (z) => z.status === 'ACTIVE',
    run: suspendServiceZone,
  },
  {
    id: 'deactivate',
    label: 'Deactivate',
    description: 'Takes the active zone out of service.',
    permission: Permission.ManageServiceZones,
    danger: true,
    visible: (z) => z.status === 'ACTIVE',
    run: deactivateServiceZone,
  },
];

/** Actions offered on the Ashanti map panel (no lock; use the zone detail page for that). */
export const MAP_ACTION_IDS: readonly string[] = [
  'submit-review',
  'verify',
  'activate',
  'suspend',
  'deactivate',
];
