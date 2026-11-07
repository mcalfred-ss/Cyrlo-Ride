import { notImplemented } from '../../common/errors/not-implemented.js';
import { AppError } from '../../common/errors/app-error.js';
import type { AuditService } from '../audit/module.service.js';
import type {
  AssertPickupInput,
  AssignRiderZoneInput,
  CreateServiceZoneInput,
  ListServiceZonesQuery,
  RejectOrRevokeZoneInput,
  UpdateServiceZoneInput,
} from './module.schema.js';
import type { ServiceZonesRepository } from './module.repository.js';
import { validateAndNormalizeBoundary } from './zone-geometry.js';

export interface ServiceZonesServiceDeps {
  audit: AuditService;
  now?: () => Date;
}

export interface ServiceZonesService {
  createZone(actorId: string, input: CreateServiceZoneInput, ip?: string): Promise<unknown>;
  getZone(zoneId: string): Promise<unknown>;
  listZones(query: ListServiceZonesQuery): Promise<unknown>;
  updateZone(
    actorId: string,
    zoneId: string,
    input: UpdateServiceZoneInput,
    ip?: string,
  ): Promise<unknown>;
  activateZone(actorId: string, zoneId: string, ip?: string): Promise<unknown>;
  deactivateZone(actorId: string, zoneId: string, ip?: string): Promise<unknown>;
  assignRider(
    actorId: string,
    zoneId: string,
    input: AssignRiderZoneInput,
    ip?: string,
  ): Promise<unknown>;
  approveRiderZone(actorId: string, approvalId: string, ip?: string): Promise<unknown>;
  rejectRiderZone(
    actorId: string,
    approvalId: string,
    input: RejectOrRevokeZoneInput,
    ip?: string,
  ): Promise<unknown>;
  revokeRiderZone(
    actorId: string,
    approvalId: string,
    input: RejectOrRevokeZoneInput,
    ip?: string,
  ): Promise<unknown>;
  listZoneRiders(zoneId: string): Promise<unknown>;
  listRiderZones(riderId: string): Promise<unknown>;
  listRiderZoneHistory(riderId: string): Promise<unknown>;
  assertPickupSupported(input: AssertPickupInput): Promise<never>;
}

export class ServiceZonesServiceImpl implements ServiceZonesService {
  private readonly now: () => Date;

  constructor(
    private readonly repository: ServiceZonesRepository,
    private readonly deps: ServiceZonesServiceDeps,
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  async createZone(actorId: string, input: CreateServiceZoneInput, ip?: string) {
    const { boundary, boundingBox } = validateAndNormalizeBoundary(input.boundary);
    const activate = input.activate === true;
    const zone = await this.repository.createZone({
      name: input.name,
      description: input.description,
      boundary,
      box: boundingBox,
      isActive: activate,
      actorId,
    });
    await this.deps.audit.record({
      actorId,
      action: 'service_zone.created',
      entityType: 'service_zone',
      entityId: zone.id,
      metadata: {
        name: zone.name,
        isActive: zone.isActive,
        geometryType: boundary.type,
      },
      ipAddress: ip,
    });
    if (activate) {
      await this.deps.audit.record({
        actorId,
        action: 'service_zone.activated',
        entityType: 'service_zone',
        entityId: zone.id,
        ipAddress: ip,
      });
    }
    return toZoneView(zone);
  }

  async getZone(zoneId: string) {
    const zone = await this.requireZone(zoneId);
    return toZoneView(zone);
  }

  async listZones(query: ListServiceZonesQuery) {
    const { total, items } = await this.repository.listZones(query);
    return {
      items: items.map(toZoneView),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        hasNextPage: query.page * query.pageSize < total,
      },
    };
  }

  async updateZone(
    actorId: string,
    zoneId: string,
    input: UpdateServiceZoneInput,
    ip?: string,
  ) {
    await this.requireZone(zoneId);
    let boundaryChanged = false;
    let normalized:
      | ReturnType<typeof validateAndNormalizeBoundary>
      | undefined;
    if (input.boundary !== undefined) {
      normalized = validateAndNormalizeBoundary(input.boundary);
      boundaryChanged = true;
    }
    const zone = await this.repository.updateZone(zoneId, {
      name: input.name,
      description: input.description,
      boundary: normalized?.boundary,
      box: normalized?.boundingBox,
      actorId,
    });
    await this.deps.audit.record({
      actorId,
      action: 'service_zone.updated',
      entityType: 'service_zone',
      entityId: zoneId,
      metadata: {
        fields: Object.keys(input),
        boundaryChanged,
      },
      ipAddress: ip,
    });
    if (boundaryChanged) {
      await this.deps.audit.record({
        actorId,
        action: 'service_zone.boundary_changed',
        entityType: 'service_zone',
        entityId: zoneId,
        metadata: { geometryType: normalized!.boundary.type },
        ipAddress: ip,
      });
    }
    return toZoneView(zone);
  }

  async activateZone(actorId: string, zoneId: string, ip?: string) {
    const existing = await this.requireZone(zoneId);
    if (existing.isActive) {
      return toZoneView(existing);
    }
    // Ensure stored boundary is still valid before activation.
    validateAndNormalizeBoundary(existing.boundary);
    const zone = await this.repository.updateZone(zoneId, {
      isActive: true,
      actorId,
    });
    await this.deps.audit.record({
      actorId,
      action: 'service_zone.activated',
      entityType: 'service_zone',
      entityId: zoneId,
      ipAddress: ip,
    });
    return toZoneView(zone);
  }

  async deactivateZone(actorId: string, zoneId: string, ip?: string) {
    const existing = await this.requireZone(zoneId);
    if (!existing.isActive) {
      return toZoneView(existing);
    }
    const zone = await this.repository.updateZone(zoneId, {
      isActive: false,
      actorId,
    });
    await this.deps.audit.record({
      actorId,
      action: 'service_zone.deactivated',
      entityType: 'service_zone',
      entityId: zoneId,
      ipAddress: ip,
    });
    return toZoneView(zone);
  }

  async assignRider(
    actorId: string,
    zoneId: string,
    input: AssignRiderZoneInput,
    ip?: string,
  ) {
    if (actorId === input.riderId) {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Administrators cannot assign their own rider profile to a zone',
      });
    }
    const zone = await this.requireZone(zoneId);
    const rider = await this.repository.findRiderProfile(input.riderId);
    if (!rider) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Rider profile not found',
      });
    }
    if (rider.user.status === 'SUSPENDED' || rider.user.status === 'DELETED') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Rider account is not eligible for zone assignment',
      });
    }

    const existing = await this.repository.findApproval(input.riderId, zoneId);
    if (existing) {
      if (existing.status === 'PENDING' || existing.status === 'APPROVED') {
        throw new AppError({
          status: 409,
          code: 'CONFLICT',
          message: 'Rider already has a pending or approved assignment for this zone',
        });
      }
      // Rejected/revoked can be reopened to PENDING.
      if (!zone.isActive) {
        throw new AppError({
          status: 409,
          code: 'CONFLICT',
          message: 'Cannot assign riders to an inactive zone',
        });
      }
      const reopened = await this.repository.reopenApproval({
        approvalId: existing.id,
        riderId: input.riderId,
        zoneId,
        actorId,
        now: this.now(),
      });
      await this.deps.audit.record({
        actorId,
        action: 'rider_zone.assigned',
        entityType: 'rider_zone_approval',
        entityId: reopened.id,
        metadata: { riderId: input.riderId, zoneId, reopened: true },
        ipAddress: ip,
      });
      return toApprovalView(reopened);
    }

    if (!zone.isActive) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Cannot assign riders to an inactive zone',
      });
    }

    const approval = await this.repository.createApproval({
      riderId: input.riderId,
      zoneId,
      actorId,
    });
    await this.deps.audit.record({
      actorId,
      action: 'rider_zone.assigned',
      entityType: 'rider_zone_approval',
      entityId: approval.id,
      metadata: { riderId: input.riderId, zoneId },
      ipAddress: ip,
    });
    return toApprovalView(approval);
  }

  async approveRiderZone(actorId: string, approvalId: string, ip?: string) {
    const approval = await this.requireApproval(approvalId);
    if (actorId === approval.riderId) {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Riders cannot approve their own zone application',
      });
    }
    if (!approval.zone.isActive) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Cannot approve a rider for an inactive zone',
      });
    }
    if (approval.status === 'APPROVED') {
      return toApprovalView(approval);
    }
    if (approval.status !== 'PENDING') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Only pending zone applications can be approved',
      });
    }
    const updated = await this.repository.transitionApproval({
      approvalId,
      riderId: approval.riderId,
      zoneId: approval.zoneId,
      status: 'APPROVED',
      actorId,
      now: this.now(),
    });
    await this.deps.audit.record({
      actorId,
      action: 'rider_zone.approved',
      entityType: 'rider_zone_approval',
      entityId: approvalId,
      metadata: { riderId: approval.riderId, zoneId: approval.zoneId },
      ipAddress: ip,
    });
    return toApprovalView(updated);
  }

  async rejectRiderZone(
    actorId: string,
    approvalId: string,
    input: RejectOrRevokeZoneInput,
    ip?: string,
  ) {
    const approval = await this.requireApproval(approvalId);
    if (actorId === approval.riderId) {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Riders cannot reject their own zone application',
      });
    }
    if (approval.status !== 'PENDING') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Only pending zone applications can be rejected',
      });
    }
    const updated = await this.repository.transitionApproval({
      approvalId,
      riderId: approval.riderId,
      zoneId: approval.zoneId,
      status: 'REJECTED',
      reason: input.reason,
      actorId,
      now: this.now(),
    });
    await this.deps.audit.record({
      actorId,
      action: 'rider_zone.rejected',
      entityType: 'rider_zone_approval',
      entityId: approvalId,
      metadata: { riderId: approval.riderId, zoneId: approval.zoneId, reason: input.reason },
      ipAddress: ip,
    });
    return toApprovalView(updated);
  }

  async revokeRiderZone(
    actorId: string,
    approvalId: string,
    input: RejectOrRevokeZoneInput,
    ip?: string,
  ) {
    const approval = await this.requireApproval(approvalId);
    if (actorId === approval.riderId) {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Riders cannot revoke their own zone approval',
      });
    }
    if (approval.status !== 'APPROVED') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Only approved zone assignments can be revoked',
      });
    }
    const updated = await this.repository.transitionApproval({
      approvalId,
      riderId: approval.riderId,
      zoneId: approval.zoneId,
      status: 'REVOKED',
      reason: input.reason,
      actorId,
      now: this.now(),
    });
    await this.deps.audit.record({
      actorId,
      action: 'rider_zone.revoked',
      entityType: 'rider_zone_approval',
      entityId: approvalId,
      metadata: { riderId: approval.riderId, zoneId: approval.zoneId, reason: input.reason },
      ipAddress: ip,
    });
    return toApprovalView(updated);
  }

  async listZoneRiders(zoneId: string) {
    await this.requireZone(zoneId);
    const rows = await this.repository.listApprovalsForZone(zoneId);
    return rows.map((row) => ({
      approvalId: row.id,
      riderId: row.riderId,
      fullName: row.rider.fullName,
      phoneNumber: row.rider.user.phoneNumber,
      riderAccountStatus: row.rider.user.status,
      riderVerificationStatus: row.rider.verificationStatus,
      status: row.status,
      reason: row.reason,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async listRiderZones(riderId: string) {
    const rider = await this.repository.findRiderProfile(riderId);
    if (!rider) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Rider profile not found' });
    }
    const rows = await this.repository.listApprovalsForRider(riderId);
    return rows.map((row) => ({
      approvalId: row.id,
      zoneId: row.zoneId,
      zoneName: row.zone.name,
      zoneActive: row.zone.isActive,
      status: row.status,
      reason: row.reason,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async listRiderZoneHistory(riderId: string) {
    const rider = await this.repository.findRiderProfile(riderId);
    if (!rider) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Rider profile not found' });
    }
    const rows = await this.repository.listDecisionsForRider(riderId);
    return rows.map((row) => ({
      id: row.id,
      approvalId: row.approvalId,
      zoneId: row.zoneId,
      zoneName: row.zone.name,
      status: row.status,
      reason: row.reason,
      actorId: row.actorId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async assertPickupSupported(_input: AssertPickupInput): Promise<never> {
    // Point-in-polygon matching during booking is Milestone 5+.
    notImplemented('assertPickupSupported');
  }

  private async requireZone(zoneId: string) {
    const zone = await this.repository.findZone(zoneId);
    if (!zone) {
      throw new AppError({ status: 404, code: 'NOT_FOUND', message: 'Service zone not found' });
    }
    return zone;
  }

  private async requireApproval(approvalId: string) {
    const approval = await this.repository.findApprovalById(approvalId);
    if (!approval) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Rider zone approval not found',
      });
    }
    return approval;
  }
}

function toZoneView(zone: {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  boundary: unknown;
  minLatitude: { toNumber?: () => number } | number | string;
  maxLatitude: { toNumber?: () => number } | number | string;
  minLongitude: { toNumber?: () => number } | number | string;
  maxLongitude: { toNumber?: () => number } | number | string;
  createdById?: string | null;
  updatedById?: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: zone.id,
    name: zone.name,
    description: zone.description,
    isActive: zone.isActive,
    boundary: zone.boundary,
    boundingBox: {
      minLatitude: decimalToNumber(zone.minLatitude),
      maxLatitude: decimalToNumber(zone.maxLatitude),
      minLongitude: decimalToNumber(zone.minLongitude),
      maxLongitude: decimalToNumber(zone.maxLongitude),
    },
    createdById: zone.createdById ?? null,
    updatedById: zone.updatedById ?? null,
    createdAt: zone.createdAt.toISOString(),
    updatedAt: zone.updatedAt.toISOString(),
  };
}

function toApprovalView(approval: {
  id: string;
  riderId: string;
  zoneId: string;
  status: string;
  reason: string | null;
  decidedAt: Date | null;
  decidedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: approval.id,
    riderId: approval.riderId,
    zoneId: approval.zoneId,
    status: approval.status,
    reason: approval.reason,
    decidedAt: approval.decidedAt?.toISOString() ?? null,
    decidedById: approval.decidedById,
    createdAt: approval.createdAt.toISOString(),
    updatedAt: approval.updatedAt.toISOString(),
  };
}

function decimalToNumber(value: { toNumber?: () => number } | number | string): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (typeof value.toNumber === 'function') return value.toNumber();
  return Number(value);
}
