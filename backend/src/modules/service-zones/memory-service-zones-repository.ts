import { randomUUID } from 'node:crypto';

import { AppError } from '../../common/errors/app-error.js';
import type { BoundingBox, ZoneBoundary } from './zone-geometry.js';

type ZoneRow = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
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
    boundary: ZoneBoundary;
    box: BoundingBox;
    isActive: boolean;
    actorId: string;
  }) {
    const now = new Date();
    const zone: ZoneRow = {
      id: randomUUID(),
      name: input.name,
      description: input.description ?? null,
      isActive: input.isActive,
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
    q?: string;
  }) {
    let items = [...this.zones.values()];
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
      boundary?: ZoneBoundary;
      box?: BoundingBox;
      isActive?: boolean;
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
    if (data.isActive !== undefined) zone.isActive = data.isActive;
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
