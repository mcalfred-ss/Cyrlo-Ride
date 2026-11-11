import type {
  BoundaryVerificationStatus,
  Prisma,
  PrismaClient,
  RiderZoneApprovalStatus,
  ServiceZoneStatus,
} from '@prisma/client';

import { AppError } from '../../common/errors/app-error.js';
import type { BoundingBox, ZoneBoundary } from './zone-geometry.js';

/** Private to the service-zones module. */
export class ServiceZonesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  protected database(): PrismaClient {
    return this.prisma;
  }

  /** Zones are always created as DRAFT / UNVERIFIED / inactive. */
  async createZone(input: {
    name: string;
    description?: string | null;
    communityId?: string | null;
    slug?: string | null;
    boundary: ZoneBoundary;
    box: BoundingBox;
    actorId: string;
  }) {
    return this.prisma.serviceZone.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        communityId: input.communityId ?? null,
        slug: input.slug ?? null,
        boundary: input.boundary as unknown as Prisma.InputJsonValue,
        minLatitude: input.box.minLatitude,
        maxLatitude: input.box.maxLatitude,
        minLongitude: input.box.minLongitude,
        maxLongitude: input.box.maxLongitude,
        status: 'DRAFT',
        boundaryVerificationStatus: 'UNVERIFIED',
        isActive: false,
        createdById: input.actorId,
        updatedById: input.actorId,
      },
    });
  }

  async findZone(zoneId: string) {
    return this.prisma.serviceZone.findUnique({ where: { id: zoneId } });
  }

  /** Community with its full district → region → country chain, or null if missing. */
  async findCommunityHierarchy(communityId: string) {
    return this.prisma.community.findUnique({
      where: { id: communityId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        verificationStatus: true,
        district: {
          select: {
            id: true,
            status: true,
            region: {
              select: {
                id: true,
                status: true,
                country: { select: { id: true, status: true } },
              },
            },
          },
        },
      },
    });
  }

  async listZones(input: {
    page: number;
    pageSize: number;
    isActive?: boolean;
    status?: ServiceZoneStatus;
    communityId?: string;
    q?: string;
  }) {
    const where: Prisma.ServiceZoneWhereInput = {
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.communityId === undefined ? {} : { communityId: input.communityId }),
      ...(input.q
        ? { name: { contains: input.q, mode: 'insensitive' as const } }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.serviceZone.count({ where }),
      this.prisma.serviceZone.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ]);
    return { total, items };
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
      status?: ServiceZoneStatus;
      boundaryVerificationStatus?: BoundaryVerificationStatus;
      activatedAt?: Date | null;
      activatedById?: string | null;
      suspendedAt?: Date | null;
      suspendedById?: string | null;
      actorId: string;
    },
  ) {
    return this.prisma.serviceZone.update({
      where: { id: zoneId },
      data: {
        name: data.name,
        description: data.description,
        communityId: data.communityId,
        slug: data.slug,
        status: data.status,
        boundaryVerificationStatus: data.boundaryVerificationStatus,
        activatedAt: data.activatedAt,
        activatedById: data.activatedById,
        suspendedAt: data.suspendedAt,
        suspendedById: data.suspendedById,
        ...(data.boundary
          ? {
              boundary: data.boundary as unknown as Prisma.InputJsonValue,
              minLatitude: data.box!.minLatitude,
              maxLatitude: data.box!.maxLatitude,
              minLongitude: data.box!.minLongitude,
              maxLongitude: data.box!.maxLongitude,
            }
          : {}),
        isActive: data.isActive,
        updatedById: data.actorId,
      },
    });
  }

  async findRiderProfile(riderId: string) {
    return this.prisma.riderProfile.findUnique({
      where: { userId: riderId },
      select: {
        userId: true,
        verificationStatus: true,
        user: { select: { id: true, role: true, status: true } },
      },
    });
  }

  async findApproval(riderId: string, zoneId: string) {
    return this.prisma.riderZoneApproval.findUnique({
      where: { riderId_zoneId: { riderId, zoneId } },
    });
  }

  async findApprovalById(approvalId: string) {
    return this.prisma.riderZoneApproval.findUnique({
      where: { id: approvalId },
      include: { zone: true, rider: { select: { userId: true } } },
    });
  }

  async createApproval(input: {
    riderId: string;
    zoneId: string;
    actorId: string;
  }) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const approval = await tx.riderZoneApproval.create({
          data: {
            riderId: input.riderId,
            zoneId: input.zoneId,
            status: 'PENDING',
            decidedById: input.actorId,
            decidedAt: new Date(),
          },
        });
        await tx.riderZoneDecision.create({
          data: {
            approvalId: approval.id,
            riderId: input.riderId,
            zoneId: input.zoneId,
            actorId: input.actorId,
            status: 'PENDING',
          },
        });
        return approval;
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new AppError({
          status: 409,
          code: 'CONFLICT',
          message: 'Rider already has a zone approval record for this zone',
        });
      }
      throw error;
    }
  }

  async transitionApproval(input: {
    approvalId: string;
    riderId: string;
    zoneId: string;
    status: RiderZoneApprovalStatus;
    reason?: string | null;
    actorId: string;
    now: Date;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const approval = await tx.riderZoneApproval.update({
        where: { id: input.approvalId },
        data: {
          status: input.status,
          reason: input.reason ?? null,
          decidedAt: input.now,
          decidedById: input.actorId,
        },
      });
      await tx.riderZoneDecision.create({
        data: {
          approvalId: input.approvalId,
          riderId: input.riderId,
          zoneId: input.zoneId,
          actorId: input.actorId,
          status: input.status,
          reason: input.reason ?? null,
        },
      });
      return approval;
    });
  }

  async listApprovalsForZone(zoneId: string, status?: RiderZoneApprovalStatus) {
    return this.prisma.riderZoneApproval.findMany({
      where: { zoneId, ...(status ? { status } : {}) },
      orderBy: { updatedAt: 'desc' },
      include: {
        rider: {
          select: {
            userId: true,
            fullName: true,
            verificationStatus: true,
            user: { select: { phoneNumber: true, status: true, role: true } },
          },
        },
      },
    });
  }

  async listApprovalsForRider(riderId: string) {
    return this.prisma.riderZoneApproval.findMany({
      where: { riderId },
      orderBy: { updatedAt: 'desc' },
      include: {
        zone: {
          select: { id: true, name: true, isActive: true, description: true },
        },
      },
    });
  }

  async listDecisionsForRider(riderId: string) {
    return this.prisma.riderZoneDecision.findMany({
      where: { riderId },
      orderBy: { createdAt: 'desc' },
      include: {
        zone: { select: { id: true, name: true } },
        actor: { select: { id: true, phoneNumber: true } },
      },
    });
  }

  async reopenApproval(input: {
    approvalId: string;
    riderId: string;
    zoneId: string;
    actorId: string;
    now: Date;
  }) {
    return this.transitionApproval({
      approvalId: input.approvalId,
      riderId: input.riderId,
      zoneId: input.zoneId,
      status: 'PENDING',
      reason: null,
      actorId: input.actorId,
      now: input.now,
    });
  }
}
