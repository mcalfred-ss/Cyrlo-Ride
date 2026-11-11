import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { staffRoleHasPermission, Permission } from '../../common/authz/permissions.js';
import { MemoryAuditService } from '../audit/module.service.js';
import { MemoryServiceZonesRepository } from './memory-service-zones-repository.js';
import type { ServiceZonesController } from './module.controller.js';
import { rejectOrRevokeZoneSchema } from './module.schema.js';
import { createServiceZonesRouter } from './module.routes.js';
import { ServiceZonesServiceImpl } from './module.service.js';
import type { ServiceZonesRepository } from './module.repository.js';
import { validateAndNormalizeBoundary } from './zone-geometry.js';

/** Synthetic square used only for geometry unit tests — not a real pilot boundary. */
const testPolygon = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [-1.63, 6.68],
      [-1.62, 6.68],
      [-1.62, 6.69],
      [-1.63, 6.69],
      [-1.63, 6.68],
    ],
  ],
};

const testMultiPolygon = {
  type: 'MultiPolygon' as const,
  coordinates: [testPolygon.coordinates, testPolygon.coordinates],
};

function createService(repo = new MemoryServiceZonesRepository()) {
  const audit = new MemoryAuditService();
  const service = new ServiceZonesServiceImpl(repo as unknown as ServiceZonesRepository, {
    audit,
  });
  return { service, repo, audit };
}

describe('zone permissions', () => {
  it('allows Super and Operations to manage zones, denies Finance and Support', () => {
    expect(staffRoleHasPermission('SUPER_ADMIN', Permission.ManageServiceZones)).toBe(true);
    expect(staffRoleHasPermission('OPERATIONS_ADMIN', Permission.ManageServiceZones)).toBe(true);
    expect(staffRoleHasPermission('FINANCE_ADMIN', Permission.ManageServiceZones)).toBe(false);
    expect(staffRoleHasPermission('SUPPORT_ADMIN', Permission.ManageServiceZones)).toBe(false);
  });
});

describe('zone geometry validation', () => {
  it('accepts valid Polygon and MultiPolygon and rejects malformed geometry', () => {
    expect(validateAndNormalizeBoundary(testPolygon).boundingBox.minLatitude).toBe(6.68);
    expect(validateAndNormalizeBoundary(testMultiPolygon).boundary.type).toBe('MultiPolygon');
    expect(() => validateAndNormalizeBoundary({ type: 'Point', coordinates: [0, 0] })).toThrow(
      /Polygon or MultiPolygon/,
    );
    expect(() =>
      validateAndNormalizeBoundary({
        type: 'Polygon',
        coordinates: [
          [
            [-1.63, 6.68],
            [-1.62, 6.68],
            [-1.63, 6.68],
          ],
        ],
      }),
    ).toThrow(/at least 4 positions/);
    expect(() =>
      validateAndNormalizeBoundary({
        type: 'Polygon',
        coordinates: [
          [
            [-1.63, 6.68],
            [-1.62, 6.68],
            [-1.62, 6.69],
            [-1.63, 6.69],
            [-1.62, 6.68],
          ],
        ],
      }),
    ).toThrow(/must be closed/);
    expect(() =>
      validateAndNormalizeBoundary({
        type: 'Polygon',
        coordinates: [[[200, 6.68], [201, 6.68], [201, 6.69], [200, 6.69], [200, 6.68]]],
      }),
    ).toThrow(/Longitude/);
  });

  it('rejects boundaries that exceed the vertex budget', () => {
    const ring: [number, number][] = [];
    for (let i = 0; i < 5002; i += 1) {
      ring.push([-1.63 + i * 1e-7, 6.68 + (i % 2) * 1e-7]);
    }
    ring.push(ring[0]!);
    expect(() =>
      validateAndNormalizeBoundary({ type: 'Polygon', coordinates: [ring] }),
    ).toThrow(/maximum of 5000 vertices/);
  });
});

describe('reject/revoke reason schema', () => {
  it('requires a mandatory reason of at least 5 characters', () => {
    expect(rejectOrRevokeZoneSchema.safeParse({ reason: 'ab' }).success).toBe(false);
    expect(rejectOrRevokeZoneSchema.safeParse({}).success).toBe(false);
    expect(
      rejectOrRevokeZoneSchema.safeParse({ reason: 'Missing local coverage proof' }).success,
    ).toBe(true);
  });
});

type ZoneView = {
  id: string;
  status: string;
  isActive: boolean;
  boundaryVerificationStatus: string;
  communityId: string | null;
  slug: string | null;
  activatedAt: string | null;
  activatedById: string | null;
  suspendedAt: string | null;
  suspendedById: string | null;
};

type TestService = ReturnType<typeof createService>;

/** Drives a zone through the full approved path: DRAFT → UNDER_REVIEW → LOCKED(verified) → ACTIVE. */
async function createActiveZone(
  ctx: TestService,
  actorId: string,
  name: string,
): Promise<ZoneView> {
  const community = ctx.repo.seedCommunity({ slug: `c-${randomUUID().slice(0, 8)}` });
  const zone = (await ctx.service.createZone(actorId, {
    name,
    boundary: testPolygon,
    communityId: community.id,
  })) as ZoneView;
  await ctx.service.submitReview(actorId, zone.id);
  await ctx.service.verifyBoundary(actorId, zone.id);
  return (await ctx.service.activateZone(actorId, zone.id)) as ZoneView;
}

async function createDraftZone(
  ctx: TestService,
  actorId: string,
  extra: { communityId?: string; slug?: string } = {},
): Promise<ZoneView> {
  return (await ctx.service.createZone(actorId, {
    name: 'Lifecycle Zone',
    boundary: testPolygon,
    ...extra,
  })) as ZoneView;
}

describe('service zone creation', () => {
  it('always creates DRAFT / UNVERIFIED / inactive zones and stores community + slug', async () => {
    const actorId = randomUUID();
    const ctx = createService();
    const community = ctx.repo.seedCommunity();
    const created = await createDraftZone(ctx, actorId, {
      communityId: community.id,
      slug: 'lifecycle-zone',
    });
    expect(created.status).toBe('DRAFT');
    expect(created.boundaryVerificationStatus).toBe('UNVERIFIED');
    expect(created.isActive).toBe(false);
    expect(created.communityId).toBe(community.id);
    expect(created.slug).toBe('lifecycle-zone');
    expect(created.activatedAt).toBeNull();
    expect(ctx.audit.entries.some((entry) => entry.action === 'service_zone.created')).toBe(true);
  });

  it('rejects activate:true on create with VALIDATION_ERROR and creates nothing', async () => {
    const ctx = createService();
    await expect(
      ctx.service.createZone(randomUUID(), {
        name: 'Eager Zone',
        boundary: testPolygon,
        activate: true,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(ctx.repo.zones.size).toBe(0);
    // Explicit false is harmless.
    const ok = (await ctx.service.createZone(randomUUID(), {
      name: 'Calm Zone',
      boundary: testPolygon,
      activate: false,
    })) as ZoneView;
    expect(ok.status).toBe('DRAFT');
  });

  it('validates boundary and community existence on create', async () => {
    const ctx = createService();
    await expect(
      ctx.service.createZone(randomUUID(), { name: 'Bad Geometry', boundary: { type: 'Point' } }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      ctx.service.createZone(randomUUID(), {
        name: 'Orphan',
        boundary: testPolygon,
        communityId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(ctx.repo.zones.size).toBe(0);
  });
});

describe('service zone updates', () => {
  it('allows boundary edits only in DRAFT and resets boundary verification', async () => {
    const actorId = randomUUID();
    const ctx = createService();
    const zone = await createDraftZone(ctx, actorId);

    // Verified while still DRAFT, then edited: verification must reset.
    await ctx.service.verifyBoundary(actorId, zone.id);
    expect(ctx.repo.zones.get(zone.id)?.boundaryVerificationStatus).toBe('VERIFIED');
    const edited = (await ctx.service.updateZone(actorId, zone.id, {
      name: 'Lifecycle Zone v2',
      boundary: testMultiPolygon,
    })) as ZoneView;
    expect(edited.boundaryVerificationStatus).toBe('UNVERIFIED');
    expect(ctx.audit.entries.some((entry) => entry.action === 'service_zone.boundary_changed')).toBe(
      true,
    );

    await ctx.service.submitReview(actorId, zone.id);
    await expect(
      ctx.service.updateZone(actorId, zone.id, { boundary: testPolygon }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: /DRAFT/ });
    // Name stays editable outside DRAFT and does not touch verification.
    const renamed = (await ctx.service.updateZone(actorId, zone.id, {
      name: 'Renamed In Review',
    })) as ZoneView;
    expect(renamed.status).toBe('UNDER_REVIEW');
    expect(ctx.repo.zones.get(zone.id)?.name).toBe('Renamed In Review');

    for (const status of ['LOCKED', 'SUSPENDED', 'ACTIVE'] as const) {
      ctx.repo.zones.get(zone.id)!.status = status;
      await expect(
        ctx.service.updateZone(actorId, zone.id, { boundary: testPolygon }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    }
  });

  it('rejects invalid boundary edits and unknown communities, and freezes community/slug when ACTIVE', async () => {
    const actorId = randomUUID();
    const ctx = createService();
    const zone = await createDraftZone(ctx, actorId);
    await expect(
      ctx.service.updateZone(actorId, zone.id, { boundary: { type: 'LineString' } }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      ctx.service.updateZone(actorId, zone.id, { communityId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const community = ctx.repo.seedCommunity();
    const updated = (await ctx.service.updateZone(actorId, zone.id, {
      communityId: community.id,
      slug: 'edited-slug',
    })) as ZoneView;
    expect(updated.communityId).toBe(community.id);
    expect(updated.slug).toBe('edited-slug');

    const active = await createActiveZone(ctx, actorId, 'Frozen Zone');
    await expect(
      ctx.service.updateZone(actorId, active.id, { slug: 'new-slug' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      ctx.service.updateZone(actorId, active.id, { communityId: null }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      ctx.service.updateZone(actorId, active.id, { name: 'Still Editable' }),
    ).resolves.toBeDefined();
  });
});

describe('service zone lifecycle', () => {
  it('walks DRAFT → UNDER_REVIEW → LOCKED(verified) → ACTIVE → SUSPENDED → ACTIVE → LOCKED', async () => {
    const actorId = randomUUID();
    const verifierId = randomUUID();
    const ctx = createService();
    const community = ctx.repo.seedCommunity();
    const zone = await createDraftZone(ctx, actorId, { communityId: community.id });

    const review = (await ctx.service.submitReview(actorId, zone.id)) as ZoneView;
    expect(review.status).toBe('UNDER_REVIEW');
    expect(review.isActive).toBe(false);

    const verified = (await ctx.service.verifyBoundary(verifierId, zone.id)) as ZoneView;
    expect(verified.boundaryVerificationStatus).toBe('VERIFIED');
    expect(verified.status).toBe('LOCKED');
    expect(verified.isActive).toBe(false);

    const active = (await ctx.service.activateZone(actorId, zone.id)) as ZoneView;
    expect(active.status).toBe('ACTIVE');
    expect(active.isActive).toBe(true);
    expect(active.activatedById).toBe(actorId);
    expect(active.activatedAt).not.toBeNull();
    expect(active.suspendedAt).toBeNull();

    const suspended = (await ctx.service.suspendZone(actorId, zone.id)) as ZoneView;
    expect(suspended.status).toBe('SUSPENDED');
    expect(suspended.isActive).toBe(false);
    expect(suspended.suspendedById).toBe(actorId);
    expect(suspended.suspendedAt).not.toBeNull();

    const reactivated = (await ctx.service.activateZone(actorId, zone.id)) as ZoneView;
    expect(reactivated.status).toBe('ACTIVE');
    expect(reactivated.isActive).toBe(true);
    expect(reactivated.suspendedAt).toBeNull();
    expect(reactivated.suspendedById).toBeNull();

    const locked = (await ctx.service.lockZone(actorId, zone.id)) as ZoneView;
    expect(locked.status).toBe('LOCKED');
    expect(locked.isActive).toBe(false);

    const actions = ctx.audit.entries.map((entry) => entry.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'service_zone.created',
        'service_zone.submitted_for_review',
        'service_zone.verified',
        'service_zone.activated',
        'service_zone.suspended',
        'service_zone.locked',
      ]),
    );
    const verifiedEntry = ctx.audit.entries.find((entry) => entry.action === 'service_zone.verified');
    expect(verifiedEntry?.actorId).toBe(verifierId);
  });

  it('only submits DRAFT zones for review and requires a valid boundary', async () => {
    const actorId = randomUUID();
    const ctx = createService();
    const zone = await createDraftZone(ctx, actorId);
    await ctx.service.submitReview(actorId, zone.id);
    await expect(ctx.service.submitReview(actorId, zone.id)).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    const broken = await createDraftZone(ctx, actorId);
    ctx.repo.zones.get(broken.id)!.boundary = { type: 'Point', coordinates: [0, 0] } as never;
    await expect(ctx.service.submitReview(actorId, broken.id)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(ctx.repo.zones.get(broken.id)?.status).toBe('DRAFT');
    await expect(ctx.service.submitReview(actorId, randomUUID())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('re-validates geometry when verifying and leaves the zone unverified on failure', async () => {
    const actorId = randomUUID();
    const ctx = createService();
    const zone = await createDraftZone(ctx, actorId);
    await ctx.service.submitReview(actorId, zone.id);
    ctx.repo.zones.get(zone.id)!.boundary = { type: 'Point', coordinates: [0, 0] } as never;
    await expect(ctx.service.verifyBoundary(actorId, zone.id)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(ctx.repo.zones.get(zone.id)?.boundaryVerificationStatus).toBe('UNVERIFIED');
    expect(ctx.repo.zones.get(zone.id)?.status).toBe('UNDER_REVIEW');
  });

  it('cannot activate unverified zones (DRAFT, UNDER_REVIEW, or locked-without-verification)', async () => {
    const actorId = randomUUID();
    const ctx = createService();
    const community = ctx.repo.seedCommunity();

    const draft = await createDraftZone(ctx, actorId, { communityId: community.id });
    await expect(ctx.service.activateZone(actorId, draft.id)).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    await ctx.service.submitReview(actorId, draft.id);
    await expect(ctx.service.activateZone(actorId, draft.id)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: /VERIFIED/,
    });

    await ctx.service.lockZone(actorId, draft.id);
    await expect(ctx.service.activateZone(actorId, draft.id)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: /VERIFIED/,
    });
    const row = ctx.repo.zones.get(draft.id)!;
    expect(row.status).toBe('LOCKED');
    expect(row.isActive).toBe(false);
    expect(row.activatedAt).toBeNull();
    expect(ctx.audit.entries.some((entry) => entry.action === 'service_zone.activated')).toBe(false);
  });

  it('activates from UNDER_REVIEW only when the boundary was already verified', async () => {
    const actorId = randomUUID();
    const ctx = createService();
    const community = ctx.repo.seedCommunity();
    const zone = await createDraftZone(ctx, actorId, { communityId: community.id });
    await ctx.service.verifyBoundary(actorId, zone.id); // stays DRAFT
    expect(ctx.repo.zones.get(zone.id)?.status).toBe('DRAFT');
    await ctx.service.submitReview(actorId, zone.id);
    expect(ctx.repo.zones.get(zone.id)?.status).toBe('UNDER_REVIEW');
    const active = (await ctx.service.activateZone(actorId, zone.id)) as ZoneView;
    expect(active.status).toBe('ACTIVE');
    expect(active.isActive).toBe(true);
  });

  it('requires a community and a fully ACTIVE + VERIFIED geography chain to activate', async () => {
    const actorId = randomUUID();
    const ctx = createService();

    const noCommunity = await createDraftZone(ctx, actorId);
    await ctx.service.submitReview(actorId, noCommunity.id);
    await ctx.service.verifyBoundary(actorId, noCommunity.id);
    await expect(ctx.service.activateZone(actorId, noCommunity.id)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: /community/,
    });

    const cases = [
      { name: 'community inactive', overrides: { status: 'INACTIVE' as const } },
      { name: 'district inactive', overrides: { districtStatus: 'INACTIVE' as const } },
      { name: 'region inactive', overrides: { regionStatus: 'INACTIVE' as const } },
      { name: 'country inactive', overrides: { countryStatus: 'INACTIVE' as const } },
    ];
    for (const testCase of cases) {
      const community = ctx.repo.seedCommunity(testCase.overrides);
      const zone = await createDraftZone(ctx, actorId, { communityId: community.id });
      await ctx.service.submitReview(actorId, zone.id);
      await ctx.service.verifyBoundary(actorId, zone.id);
      await expect(
        ctx.service.activateZone(actorId, zone.id),
        testCase.name,
      ).rejects.toMatchObject({ code: 'CONFLICT', message: /ACTIVE/ });
      expect(ctx.repo.zones.get(zone.id)?.isActive).toBe(false);
    }

    const unverified = ctx.repo.seedCommunity({ verificationStatus: 'UNVERIFIED' });
    const zone = await createDraftZone(ctx, actorId, { communityId: unverified.id });
    await ctx.service.submitReview(actorId, zone.id);
    await ctx.service.verifyBoundary(actorId, zone.id);
    await expect(ctx.service.activateZone(actorId, zone.id)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: /Community must be VERIFIED/,
    });
  });

  it('re-validates stored geometry at activation', async () => {
    const actorId = randomUUID();
    const ctx = createService();
    const community = ctx.repo.seedCommunity();
    const zone = await createDraftZone(ctx, actorId, { communityId: community.id });
    await ctx.service.submitReview(actorId, zone.id);
    await ctx.service.verifyBoundary(actorId, zone.id);
    ctx.repo.zones.get(zone.id)!.boundary = { type: 'Point', coordinates: [0, 0] } as never;
    await expect(ctx.service.activateZone(actorId, zone.id)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(ctx.repo.zones.get(zone.id)?.isActive).toBe(false);
  });

  it('suspends only ACTIVE zones; lock works from any state', async () => {
    const actorId = randomUUID();
    const ctx = createService();
    const draft = await createDraftZone(ctx, actorId);
    await expect(ctx.service.suspendZone(actorId, draft.id)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    const lockedDraft = (await ctx.service.lockZone(actorId, draft.id)) as ZoneView;
    expect(lockedDraft.status).toBe('LOCKED');
    await expect(ctx.service.suspendZone(actorId, draft.id)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    // Idempotent lock does not write another audit entry.
    const before = ctx.audit.entries.filter((entry) => entry.action === 'service_zone.locked').length;
    await ctx.service.lockZone(actorId, draft.id);
    expect(ctx.audit.entries.filter((entry) => entry.action === 'service_zone.locked').length).toBe(
      before,
    );

    const active = await createActiveZone(ctx, actorId, 'Lockable Active');
    const lockedActive = (await ctx.service.lockZone(actorId, active.id)) as ZoneView;
    expect(lockedActive.status).toBe('LOCKED');
    expect(lockedActive.isActive).toBe(false);
  });

  it('deactivateZone is a compatibility alias: suspend when ACTIVE, lock otherwise', async () => {
    const actorId = randomUUID();
    const ctx = createService();
    const active = await createActiveZone(ctx, actorId, 'Compat Active');
    const suspended = (await ctx.service.deactivateZone(actorId, active.id)) as ZoneView;
    expect(suspended.status).toBe('SUSPENDED');
    expect(suspended.isActive).toBe(false);
    expect(ctx.audit.entries.some((entry) => entry.action === 'service_zone.suspended')).toBe(true);

    // Already inactive status: no change.
    const again = (await ctx.service.deactivateZone(actorId, active.id)) as ZoneView;
    expect(again.status).toBe('SUSPENDED');

    const draft = await createDraftZone(ctx, actorId);
    const locked = (await ctx.service.deactivateZone(actorId, draft.id)) as ZoneView;
    expect(locked.status).toBe('LOCKED');
    expect(ctx.audit.entries.some((entry) => entry.action === 'service_zone.locked')).toBe(true);
  });

  it('keeps zone rows when suspended or locked (history preserved)', async () => {
    const actorId = randomUUID();
    const ctx = createService();
    const active = await createActiveZone(ctx, actorId, 'History Zone');
    await ctx.service.suspendZone(actorId, active.id);
    await ctx.service.lockZone(actorId, active.id);
    expect(ctx.repo.zones.has(active.id)).toBe(true);
  });

  it('exposes lifecycle fields through list/get views and supports status filters', async () => {
    const actorId = randomUUID();
    const ctx = createService();
    const active = await createActiveZone(ctx, actorId, 'Visible Active');
    await createDraftZone(ctx, actorId);
    const fetched = (await ctx.service.getZone(active.id)) as ZoneView;
    expect(fetched.status).toBe('ACTIVE');
    expect(fetched.boundaryVerificationStatus).toBe('VERIFIED');
    const list = (await ctx.service.listZones({
      page: 1,
      pageSize: 20,
      status: 'DRAFT',
    })) as { items: ZoneView[]; meta: { total: number } };
    expect(list.meta.total).toBe(1);
    expect(list.items[0]?.status).toBe('DRAFT');
  });
});

describe('zone lifecycle permissions and routes', () => {
  it('restricts VerifyServiceZones to Super Admin', () => {
    expect(staffRoleHasPermission('SUPER_ADMIN', Permission.VerifyServiceZones)).toBe(true);
    for (const role of ['OPERATIONS_ADMIN', 'FINANCE_ADMIN', 'SUPPORT_ADMIN'] as const) {
      expect(staffRoleHasPermission(role, Permission.VerifyServiceZones)).toBe(false);
    }
  });

  it('lets Operations read coverage (ViewGeoCoverage) while Finance/Support cannot manage zones', () => {
    expect(staffRoleHasPermission('OPERATIONS_ADMIN', Permission.ViewGeoCoverage)).toBe(true);
    expect(staffRoleHasPermission('OPERATIONS_ADMIN', Permission.VerifyServiceZones)).toBe(false);
    expect(staffRoleHasPermission('SUPPORT_ADMIN', Permission.ManageServiceZones)).toBe(false);
  });

  it('mounts the lifecycle endpoints on the router', () => {
    const controller = new Proxy(
      {},
      { get: () => (() => undefined) as unknown },
    ) as unknown as ServiceZonesController;
    const router = createServiceZonesRouter(controller);
    const routes = (
      router as unknown as {
        stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }>;
      }
    ).stack
      .filter((layer) => layer.route)
      .map((layer) => `${Object.keys(layer.route!.methods)[0]} ${layer.route!.path}`);
    expect(routes).toEqual(
      expect.arrayContaining([
        'post /:zoneId/submit-review',
        'post /:zoneId/verify',
        'post /:zoneId/lock',
        'post /:zoneId/suspend',
        'post /:zoneId/activate',
        'post /:zoneId/deactivate',
      ]),
    );
  });
});

describe('rider-zone approvals', () => {
  it('supports multi-zone assignment, rejects inactive approvals, and keeps history', async () => {
    const actorId = randomUUID();
    const riderId = randomUUID();
    const ctx = createService();
    const { service, repo, audit } = ctx;
    repo.seedRider({ userId: riderId, phoneNumber: '+233244111111' });

    const zoneA = await createActiveZone(ctx, actorId, 'Zone A');
    const zoneB = await createActiveZone(ctx, actorId, 'Zone B');
    const inactive = (await service.createZone(actorId, {
      name: 'Inactive',
      boundary: testPolygon,
    })) as { id: string };

    const a1 = (await service.assignRider(actorId, zoneA.id, { riderId })) as { id: string };
    const b1 = (await service.assignRider(actorId, zoneB.id, { riderId })) as { id: string };
    expect(a1.id).not.toBe(b1.id);

    await expect(service.assignRider(actorId, zoneA.id, { riderId })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(service.assignRider(actorId, inactive.id, { riderId })).rejects.toMatchObject({
      message: /inactive zone/,
    });

    await service.approveRiderZone(actorId, a1.id);
    await expect(
      service.rejectRiderZone(actorId, a1.id, { reason: 'too late' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    await service.rejectRiderZone(actorId, b1.id, { reason: 'Missing local coverage proof' });
    await service.revokeRiderZone(actorId, a1.id, { reason: 'Left the pilot area' });

    const history = (await service.listRiderZoneHistory(riderId)) as Array<{ status: string }>;
    expect(history.map((row) => row.status)).toEqual(
      expect.arrayContaining(['PENDING', 'APPROVED', 'REJECTED', 'REVOKED']),
    );
    expect(audit.entries.some((entry) => entry.action === 'rider_zone.approved')).toBe(true);
    expect(audit.entries.some((entry) => entry.action === 'rider_zone.revoked')).toBe(true);

    expect((await service.listRiderZoneHistory(riderId)).length).toBeGreaterThanOrEqual(4);

    const zoneRiders = (await service.listZoneRiders(zoneA.id)) as Array<{ status: string }>;
    expect(zoneRiders[0]?.status).toBe('REVOKED');
  });

  it('prevents self-approval', async () => {
    const riderId = randomUUID();
    const ctx = createService();
    const { service, repo } = ctx;
    repo.seedRider({ userId: riderId });
    const zone = await createActiveZone(ctx, randomUUID(), 'Self Zone');
    const opsId = randomUUID();
    const approval = (await service.assignRider(opsId, zone.id, { riderId })) as { id: string };
    await expect(service.approveRiderZone(riderId, approval.id)).rejects.toMatchObject({
      message: /cannot approve their own/,
    });
  });

  it('does not change rider Ghana Card verification when changing zone approval', async () => {
    const actorId = randomUUID();
    const riderId = randomUUID();
    const ctx = createService();
    const { service, repo } = ctx;
    repo.seedRider({ userId: riderId, verificationStatus: 'APPROVED' });
    const zone = await createActiveZone(ctx, actorId, 'Verify Isolation');
    const approval = (await service.assignRider(actorId, zone.id, { riderId })) as { id: string };
    await service.approveRiderZone(actorId, approval.id);
    expect(repo.riders.get(riderId)?.verificationStatus).toBe('APPROVED');
    await service.revokeRiderZone(actorId, approval.id, { reason: 'Ops coverage change' });
    expect(repo.riders.get(riderId)?.verificationStatus).toBe('APPROVED');
  });
});
