import { randomUUID } from 'node:crypto';

import { AppError } from '../../common/errors/app-error.js';
import type { BoundingBox, ZoneBoundary } from './zone-geometry.js';

export type ZoneStatus = 'DRAFT' | 'UNDER_REVIEW' | 'LOCKED' | 'ACTIVE' | 'SUSPENDED';
export type BoundaryVerification = 'UNVERIFIED' | 'VERIFIED';
type GeoStatus = 'ACTIVE' | 'INACTIVE';

export interface MemoryCommunityHierarchy {
  id: string;
  name: string;
  slug: string;
  status: GeoStatus;
  verificationStatus: BoundaryVerification;
  district: {
    id: string;
    status: GeoStatus;
    region: { id: string; status: GeoStatus; country: { id: string; status: GeoStatus } };
  };
}

type ZoneRow = {
  id: string;
  communityId: string | null;
  name: string;
  slug: string | null;
  description: string | null;
  isActive: boolean;
  status: ZoneStatus;
  boundaryVerificationStatus: BoundaryVerification;
  activatedAt: Date | null;
  activatedById: string | null;
  suspendedAt: Date | null;
  suspendedById: string | null;
  boundary: ZoneBoundary;
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
  createdById: string | null;
  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ApprovalRow = {
  id: string;
  riderId: string;
  zoneId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
  reason: string | null;
  decidedAt: Date | null;
  decidedById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type DecisionRow = {
  id: string;
  approvalId: string;
  riderId: string;
  zoneId: string;
  actorId: string;
  status: ApprovalRow['status'];
  reason: string | null;
  createdAt: Date;
};

export class MemoryServiceZonesRepository {
  zones = new Map<string, ZoneRow>();
  communities = new Map<string, MemoryCommunityHierarchy>();
  approvals = new Map<string, ApprovalRow>();
  decisions: DecisionRow[] = [];
  riders = new Map<
    string,
    {
      userId: string;
      verificationStatus: string;
      fullName: string;
      user: { id: string; role: string; status: string; phoneNumber: string };
    }
  >();

  /** Seeds a community with an all-ACTIVE hierarchy by default; override pieces as needed. */
  seedCommunity(
    overrides: {
      id?: string;
      name?: string;
      slug?: string;
      status?: GeoStatus;
      verificationStatus?: BoundaryVerification;
      districtStatus?: GeoStatus;
      regionStatus?: GeoStatus;
      countryStatus?: GeoStatus;
    } = {},
  ): MemoryCommunityHierarchy {
    const community: MemoryCommunityHierarchy = {
      id: overrides.id ?? randomUUID(),
      name: overrides.name ?? 'Test Community',
      slug: overrides.slug ?? 'test-community',
      status: overrides.status ?? 'ACTIVE',
      verificationStatus: overrides.verificationStatus ?? 'VERIFIED',
      district: {
        id: randomUUID(),
        status: overrides.districtStatus ?? 'ACTIVE',
        region: {
          id: randomUUID(),
          status: overrides.regionStatus ?? 'ACTIVE',
          country: { id: randomUUID(), status: overrides.countryStatus ?? 'ACTIVE' },
        },
      },
    };
    this.communities.set(community.id, community);
    return community;
  }

  async findCommunityHierarchy(communityId: string) {
    return this.communities.get(communityId) ?? null;
  }

  seedRider(input: {
    userId: string;
    fullName?: string;
    role?: string;
    status?: string;
    verificationStatus?: string;
    phoneNumber?: string;
  }) {
    this.riders.set(input.userId, {
      userId: input.userId,
      verificationStatus: input.verificationStatus ?? 'APPROVED',
      fullName: input.fullName ?? 'Rider',
      user: {
        id: input.userId,
        role: input.role ?? 'RIDER',
        status: input.status ?? 'ACTIVE',
        phoneNumber: input.phoneNumber ?? '+233244000000',
      },
    });
  }

  async createZone(input: {
    name: string;
    description?: string | null;
    communityId?: string | null;
    slug?: string | null;
    boundary: ZoneBoundary;
    box: BoundingBox;
    actorId: string;
  }) {
    const now = new Date();
    const zone: ZoneRow = {
      id: randomUUID(),
      communityId: input.communityId ?? null,
      name: input.name,
      slug: input.slug ?? null,
      description: input.description ?? null,
      isActive: false,
      status: 'DRAFT',
      boundaryVerificationStatus: 'UNVERIFIED',
      activatedAt: null,
      activatedById: null,
      suspendedAt: null,
      suspendedById: null,
      boundary: input.boundary,
      minLatitude: input.box.minLatitude,
      maxLatitude: input.box.maxLatitude,
      minLongitude: input.box.minLongitude,
      maxLongitude: input.box.maxLongitude,
      createdById: input.actorId,
      updatedById: input.actorId,
      createdAt: now,
      updatedAt: now,
    };
    this.zones.set(zone.id, zone);
    return zone;
  }

  async findZone(zoneId: string) {
    return this.zones.get(zoneId) ?? null;
  }

  async listZones(input: {
    page: number;
    pageSize: number;
    isActive?: boolean;
    status?: ZoneStatus;
    communityId?: string;
    q?: string;
  }) {
    let items = [...this.zones.values()];
    if (input.status !== undefined) {
      items = items.filter((zone) => zone.status === input.status);
    }
    if (input.communityId !== undefined) {
      items = items.filter((zone) => zone.communityId === input.communityId);
    }
    if (input.isActive !== undefined) {
      items = items.filter((zone) => zone.isActive === input.isActive);
    }
    if (input.q) {
      items = items.filter((zone) =>
        zone.name.toLowerCase().includes(input.q!.toLowerCase()),
      );
    }
    items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const total = items.length;
    const start = (input.page - 1) * input.pageSize;
    return { total, items: items.slice(start, start + input.pageSize) };
  }

  async updateZone(
    zoneId: string,
    data: {
      name?: string;
      description?: string | null;
      communityId?: string | null;
      slug?: string | null;
      boundary?: ZoneBoundary;
      box?: BoundingBox;
      isActive?: boolean;
      status?: ZoneStatus;
      boundaryVerificationStatus?: BoundaryVerification;
      activatedAt?: Date | null;
      activatedById?: string | null;
      suspendedAt?: Date | null;
      suspendedById?: string | null;
      actorId: string;
    },
  ) {
    const zone = this.zones.get(zoneId);
    if (!zone) throw new Error('missing zone');
    if (data.name !== undefined) zone.name = data.name;
    if (data.description !== undefined) zone.description = data.description;
    if (data.boundary && data.box) {
      zone.boundary = data.boundary;
      zone.minLatitude = data.box.minLatitude;
      zone.maxLatitude = data.box.maxLatitude;
      zone.minLongitude = data.box.minLongitude;
      zone.maxLongitude = data.box.maxLongitude;
    }
    if (data.communityId !== undefined) zone.communityId = data.communityId;
    if (data.slug !== undefined) zone.slug = data.slug;
    if (data.isActive !== undefined) zone.isActive = data.isActive;
    if (data.status !== undefined) zone.status = data.status;
    if (data.boundaryVerificationStatus !== undefined) {
      zone.boundaryVerificationStatus = data.boundaryVerificationStatus;
    }
    if (data.activatedAt !== undefined) zone.activatedAt = data.activatedAt;
    if (data.activatedById !== undefined) zone.activatedById = data.activatedById;
    if (data.suspendedAt !== undefined) zone.suspendedAt = data.suspendedAt;
    if (data.suspendedById !== undefined) zone.suspendedById = data.suspendedById;
    zone.updatedById = data.actorId;
    zone.updatedAt = new Date();
    return zone;
  }

  async findRiderProfile(riderId: string) {
    return this.riders.get(riderId) ?? null;
  }

  async findApproval(riderId: string, zoneId: string) {
    return (
      [...this.approvals.values()].find(
        (row) => row.riderId === riderId && row.zoneId === zoneId,
      ) ?? null
    );
  }

  async findApprovalById(approvalId: string) {
    const approval = this.approvals.get(approvalId);
    if (!approval) return null;
    return { ...approval, zone: this.zones.get(approval.zoneId)!, rider: { userId: approval.riderId } };
  }

  async createApproval(input: { riderId: string; zoneId: string; actorId: string }) {
    if (await this.findApproval(input.riderId, input.zoneId)) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Rider already has a zone approval record for this zone',
      });
    }
    const now = new Date();
    const approval: ApprovalRow = {
      id: randomUUID(),
      riderId: input.riderId,
      zoneId: input.zoneId,
      status: 'PENDING',
      reason: null,
      decidedAt: now,
      decidedById: input.actorId,
      createdAt: now,
      updatedAt: now,
    };
    this.approvals.set(approval.id, approval);
    this.decisions.push({
      id: randomUUID(),
      approvalId: approval.id,
      riderId: input.riderId,
      zoneId: input.zoneId,
      actorId: input.actorId,
      status: 'PENDING',
      reason: null,
      createdAt: now,
    });
    return approval;
  }

  async transitionApproval(input: {
    approvalId: string;
    riderId: string;
    zoneId: string;
    status: ApprovalRow['status'];
    reason?: string | null;
    actorId: string;
    now: Date;
  }) {
    const approval = this.approvals.get(input.approvalId);
    if (!approval) throw new Error('missing approval');
    approval.status = input.status;
    approval.reason = input.reason ?? null;
    approval.decidedAt = input.now;
    approval.decidedById = input.actorId;
    approval.updatedAt = input.now;
    this.decisions.push({
      id: randomUUID(),
      approvalId: input.approvalId,
      riderId: input.riderId,
      zoneId: input.zoneId,
      actorId: input.actorId,
      status: input.status,
      reason: input.reason ?? null,
      createdAt: input.now,
    });
    return approval;
  }

  async listApprovalsForZone(zoneId: string, status?: ApprovalRow['status']) {
    return [...this.approvals.values()]
      .filter((row) => row.zoneId === zoneId && (!status || row.status === status))
      .map((row) => ({
        ...row,
        rider: this.riders.get(row.riderId)!,
      }));
  }

  async listApprovalsForRider(riderId: string) {
    return [...this.approvals.values()]
      .filter((row) => row.riderId === riderId)
      .map((row) => ({
        ...row,
        zone: this.zones.get(row.zoneId)!,
      }));
  }

  async listDecisionsForRider(riderId: string) {
    return this.decisions
      .filter((row) => row.riderId === riderId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((row) => ({
        ...row,
        zone: this.zones.get(row.zoneId)!,
        actor: { id: row.actorId, phoneNumber: '+233200000000' },
      }));
  }

  async reopenApproval(input: {
    approvalId: string;
    riderId: string;
    zoneId: string;
    actorId: string;
    now: Date;
  }) {
    return this.transitionApproval({
      ...input,
      status: 'PENDING',
      reason: null,
    });
  }
}
